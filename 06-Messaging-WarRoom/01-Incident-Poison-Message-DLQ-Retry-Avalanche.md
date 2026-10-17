# Incident 01: The Visibility-Timeout Poison Message & Infinite Redelivery Avalanche

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Service Bus Premium / MassTransit .NET 9 Worker Cluster (24 Pods)  
> **Business Impact**: Queue backlog grew to 2.4M messages; 24 worker pods pinned at 100% CPU processing the same 48 batch messages in an infinite loop; downstream ERP API DDoSed  
> **Competencies Mastered**: PeekLock Duration (`LockDuration`), AutoLockRenewal (`MaxAutoRenewDuration`), PrefetchCount vs. Processing Time Math, Dead-Letter Queue (DLQ) Isolation

---

## 🚨 1. The 03:20 AM Crisis Briefing

At `03:00 AM`, a batch reconciliation job published 48 large `MerchantSettlementCommand` messages (each taking `95 seconds` to reconcile against a slow ERP endpoint). Within 10 minutes, all 24 consumer pods stopped processing normal customer orders:

```text
[03:10:05] Broker Alert: Active Queue Depth jumped from 120 to 840,000 messages!
[03:10:22] RED HERRING: ERP Team pages us: "Why is your Messaging Cluster sending duplicate POST /settle calls 10 times per merchant?!"
[03:11:00] Worker Logs: Azure.Messaging.ServiceBus.ServiceBusException: The lock supplied is invalid. Either the lock expired, or the message has already been removed from the queue (MessageLockLost).
```

> 📐 **Derive It (Fermi Mode): PrefetchCount $	imes$ Processing Time vs. Lock Expiration Storm**
> - **Inputs**: `PrefetchCount = 50`, `MaxConcurrentCalls = 4`, `MessageProcessingSec = 95`, `BrokerLockDurationSec = 60`
> - **Formula**: `TimeUntilLastPrefetchedMessageStartsSec = (PrefetchCount / MaxConcurrentCalls) * MessageProcessingSec`
> - **Step-by-Step**:
>   1. The broker's `LockDuration` was set to `60 seconds`. Even if a single message took `95s`, the developer forgot that `PrefetchCount = 50` buffered 50 locked messages in the pod's local memory immediately!
>   2. With `MaxConcurrentCalls = 4`, the 50th prefetched message sits in the pod's local buffer waiting for a worker thread for $\frac{50}{4} \times 95\text{ s} = 1,187.5\text{ seconds}$ ($19.8\text{ minutes}$)!
>   3. Because the broker lock expired at `T+60s` (`MaxDeliveryCount = 10`), the broker made those messages visible to *other* pods while Pod #1 was still working on them! All 24 pods ended up executing the exact same 48 messages concurrently ($48 \times 10 = 480$ wasted 95-second executions), starving the entire queue!
> - **What-If Sensitivity**: Rule of thumb: $\text{PrefetchCount} \le \text{MaxConcurrentCalls} \times 2$ for slow messages, AND set `MaxAutoRenewDuration = TimeSpan.FromMinutes(10)` so active in-flight locks renew automatically every 30s!

<!-- TELEMETRY_WIDGET: title="PeekLock Expiry & Duplicate Execution Storm" metric1="MessageLockLost Exceptions/min" metric2="Queue Backlog Depth (K)" threshold="0 LockLost Exceptions" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Check DeliveryCount distribution on the active queue head and Dead-Letter Queue
az servicebus queue show -g prod-rg --namespace-name sb-prod -n order-fulfillment   --query "{Active:countDetails.activeMessageCount, DLQ:countDetails.deadLetterMessageCount}"

# Step 2: Inspect pod logs for MessageLockLost vs actual exceptions
kubectl logs -n prod -l app=fulfillment-worker --tail=100 | grep "MessageLockLost"
```

### Observed Culprit Code Snippet
```csharp
// ❌ DANGEROUS PREFETCH + SHORT LOCK DURATION ON SLOW WORKER:
var processor = serviceBusClient.CreateProcessor("order-fulfillment", new ServiceBusProcessorOptions
{
    PrefetchCount = 50, // ❌ Buffers 50 messages locally; locks expire in buffer before thread starts!
    MaxConcurrentCalls = 4,
    MaxAutoLockRenewalDuration = TimeSpan.Zero // ❌ Disabled auto-renewal! Lock dies at 60s!
});
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did `PrefetchCount = 50` guarantee `MessageLockLost` even if `MaxAutoLockRenewalDuration` was enabled for active handlers, and why did the ERP see 10x duplicate calls? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. The Hidden Mechanics of `PrefetchCount` vs. `MaxAutoLockRenewalDuration`
* In Azure Service Bus / RabbitMQ (`basic.qos`), **prefetched messages sitting in the SDK's local in-memory prefetch queue have already started their broker lock countdown the instant they left the broker**!
* Crucially, the SDK's background lock-renewal timer only renews locks for messages **currently executing inside `ProcessMessageAsync`** (`MaxConcurrentCalls`), NOT the extra `PrefetchCount - MaxConcurrentCalls` messages waiting silently in the prefetch buffer!
* Therefore, for long-running messages (`> 5 seconds`), `PrefetchCount` must be set to `0` (or `<= MaxConcurrentCalls`), and slow batch jobs must be routed to a dedicated Bulkhead Queue separate from sub-second real-time checkout events!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Threading.Tasks;
using Azure.Messaging.ServiceBus;

namespace PrincipalJourney.Messaging.WarRoom;

public static class ResilientQueueProcessorFactory
{
    public static ServiceBusProcessor CreateLongRunningProcessor(ServiceBusClient client, string queueName)
    {
        var options = new ServiceBusProcessorOptions
        {
            // 1. Disable local prefetch buffer for slow (>1s) workloads so locks only start when a worker thread is free!
            PrefetchCount = 0,
            MaxConcurrentCalls = 8,
            // 2. Automatically renew PeekLock in the background for up to 15 minutes during slow ERP calls
            MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(15),
            AutoCompleteMessages = false,
            ReceiveMode = ServiceBusReceiveMode.PeekLock
        };

        return client.CreateProcessor(queueName, options);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`Prefetch=50`, No Renewal) | After (`Prefetch=0`, `AutoRenew=15m`, Queue Bulkhead) | Validation & Rollback Procedure |
|---|---|---|---|
| **`MessageLockLost` Exceptions** | `480 / 10m` | **`0`** | Chaos test injects 90s delay on downstream mock; assert 0 lock losses. |
| **Real-Time Order Queue Latency** | `42 minutes` (Starved by ERP batch) | **`18 ms`** (Isolated on dedicated `orders-realtime` queue) | Monitor queue age metric (`oldest_message_age_seconds < 5s`). |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why not just switch from `PeekLock` to `ReceiveAndDelete` mode so locks never expire?"*

**The Principal Defense**:
> *"`ReceiveAndDelete` deletes the message from the broker the millisecond it crosses the TCP socket (`At-Most-Once` delivery). If the pod is evicted by Kubernetes (`SIGTERM`/`OOMKill`) or the ERP returns a transient `503` 2 seconds later, that financial settlement message is **permanently lost forever**! Financial workloads require `PeekLock` (`At-Least-Once`) paired with an **Idempotent Consumer**."*

### Question 2 (The Second-Order Failure Mode):
> *"If a genuinely malformed JSON message (a true Poison Message) throws `JsonException` in `< 1ms`, why shouldn't we let the broker retry it 10 times with exponential backoff?"*

**The Principal Defense**:
> *"Retrying a deterministic deserialization or schema validation error 10 times wastes broker IOPS and delays alerting. Differentiate **Transient Exceptions** (`HttpRequestException`, `SqlException` transient codes $ightarrow$ `AbandonMessageAsync` with backoff) from **Non-Transient Terminal Exceptions** (`JsonException`, `ValidationException` $ightarrow$ call `DeadLetterMessageAsync(message, "InvalidPayloadSchema")` immediately on Attempt #1!)."*

### Question 3 (The FinOps / Cost Axis):
> *"Azure Service Bus Premium costs $677/month per Messaging Unit (MU), and scaling to 8 MUs to isolate queues costs $5,416/month. Defend the 80%-good alternative."*

**The Principal Defense**:
> *"You do NOT need a separate $677/month Messaging Unit per workload! A **single 1-MU or 2-MU Service Bus Premium namespace** supports **hundreds of independent Queues and Topics** within the same namespace capacity. Isolating `orders-realtime` and `erp-settlement-batch` into two separate Queues inside our existing namespace costs **$0.00 extra per month** while providing 100% worker bulkhead isolation!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0601 — Visibility-Timeout Poison Message Avalanche

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 10 minutes | **Mitigation Latency (TTM)**: 22 minutes

## Five Whys Root Cause Chain
1. **Why did real-time order processing stall?** -> All 24 worker pods were occupied re-executing 48 slow ERP messages.
2. **Why were the 48 messages executed 10 times each?** -> Their 60s broker `PeekLock` expired before completion.
3. **Why did locks expire even faster than 60s of execution?** -> `PrefetchCount = 50` held 46 messages idle in memory while their broker locks ticked down.
4. **Why did slow ERP jobs starve fast checkout events?** -> Both message types shared a single physical queue and consumer pool.
5. **Why did the ERP execute duplicate settlements?** -> Downstream handler lacked an Idempotent Consumer check before calling the external API.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Set `PrefetchCount = 0` & `MaxAutoLockRenewalDuration = 15m` on batch workers; split queues | Messaging Team | Integration test asserts 120s handler completes with 0 lock losses |
| P1 | Alert on `MessageLockLost` count > 0 in 5m | SRE Team | Prometheus alert rule deployed |
```
