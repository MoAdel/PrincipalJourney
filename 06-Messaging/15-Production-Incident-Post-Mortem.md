# Production Incident Post-Mortem: The 5-Million Message Retry Storm

| Field | Value |
|---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!
|---|
| **Incident ID** | INC-8921-SEV1 |
| **Date & Time** | 2026-08-14 02:40:00 UTC |
| **Duration** | 1 hour 48 minutes |
| **Impact** | E-commerce checkout completely halted; 5.2 million duplicate messages generated; Azure Service Bus throttling. |
| **Lead Investigator** | Tarek (Principal Systems Architect) |

---

## 1. Executive Summary

At 02:40 UTC, the Third-Party Fraud Detection API experienced a 6-minute partial outage, returning HTTP 503 Service Unavailable. 
Because the checkout event consumer was configured with immediate retries (10 attempts, 0-second delay) and no circuit breaker, 8,000 active checkout consumers retried synchronously. 
Within 90 seconds, the message broker queue depth surged from 1,200 to 5.2 million messages. Azure Service Bus entered defensive throttling mode, refusing new connections from the API tier and taking down the global checkout flow.

---

## 2. Root Cause Analysis (5 Whys)

1. **Why did checkout go down?**
   Azure Service Bus rejected all incoming connections with `ServerBusyException` (HTTP 503).
2. **Why was Service Bus busy?**
   Over 5 million retry messages flooded the primary queue in under 2 minutes.
3. **Why were so many retry messages produced?**
   Consumers were configured with an aggressive retry policy: 10 immediate retries with zero backoff.
4. **Why did consumers retry immediately?**
   Developers treated all exceptions uniformly without distinguishing transient network glitches from external service outages.
5. **Why was there no system-level circuit breaker?**
   Architectural standards did not enforce circuit breakers or decorrelated jitter on asynchronous message consumer endpoints.

---

## 3. Corrective Actions & Architectural Invariants

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Immediate & Permanent Remediation                                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Decorrelated Jitter: Replaced all immediate retry policies with     │
│    exponential backoff + random jitter (min 2s, max 60s).              │
│ 2. Polly Circuit Breaker: Cut off calls to external fraud API after   │
│    5 consecutive failures; incoming messages are quarantined directly  │
│    to DLQ or delayed queue rather than hammering the failing service. │
│ 3. Automated Rate Limiting: Bounded message prefetch to 10 per worker. │
└────────────────────────────────────────────────────────────────────────┘
```
