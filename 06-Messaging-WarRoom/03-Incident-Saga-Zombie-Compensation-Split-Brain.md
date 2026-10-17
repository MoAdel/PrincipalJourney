# Incident 03: The Out-of-Order Saga Zombie Compensation (Refund Before Capture)

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Distributed Order Saga (MassTransit State Machine / PostgreSQL Saga Repository)  
> **Business Impact**: 310 customers received full refunds while their physical shipments still dispatched ($148,000 inventory loss)  
> **Competencies Mastered**: Out-of-Order Message Arrival (`PaymentCaptured` arriving after `OrderTimedOut`), Optimistic Concurrency (`xmin` / `RowVersion`), Compensating Transaction Tombstones

---

## 🚨 1. The 04:50 PM Crisis Briefing

During a transient 45-second latency spike on the Stripe Payment Webhook gateway, the Order Fulfillment Saga State Machine triggered timeout compensations (`OrderPaymentTimedOutEvent`), cancelling orders. Two seconds later, the delayed `PaymentCapturedEvent` webhooks arrived and transitioned the cancelled orders straight into `Shipped` while the refund worker simultaneously refunded the card!

```text
[16:50:10] Finance Alert: Reconciliation mismatch — 310 orders marked BOTH 'Refunded' AND 'Shipped'!
[16:50:35] RED HERRING: Warehouse Lead blames "A bug in the barcode scanner firmware double-scanning shipping labels!"
[16:51:12] Saga Audit Log: Order #99412 transitioned: AwaitingPayment -> Cancelled (16:48:00.102) -> Paid (16:48:00.115)!
```

> 📐 **Derive It (Fermi Mode): Concurrent Saga State Transition Race Window**
> - **Inputs**: `CheckoutRPS = 120`, `GatewaySpikeDurationSec = 45`, `TimeoutThresholdSec = 30`, `RaceWindowRatio = 0.057`
> - **Formula**: `CorruptedSagas = CheckoutRPS * GatewaySpikeDurationSec * RaceWindowRatio`
> - **Step-by-Step**:
>   1. Over the `45s` payment gateway stall at `120 checkouts/sec`, $120 \times 45 = 5,400$ sagas approached the aggressive `30s` timeout threshold just as the delayed webhooks drained.
>   2. `5.7%` ($310$ sagas) had `OrderPaymentTimedOut` and `PaymentCaptured` processed concurrently or out-of-order across worker pods without a terminal-state Tombstone guard or `xmin` row version check, resulting in `$148,800` of uncompensated physical shipments!
> - **What-If Sensitivity**: Enforcing **PostgreSQL `xmin` / SQL `ROWVERSION` Optimistic Concurrency** on the Saga state row + explicitly handling `PaymentCaptured` inside the `Cancelled` state (to trigger an automatic **Late-Capture Reversal** instead of transitioning to `Paid`) reduces uncompensated shipments to **0**!

<!-- TELEMETRY_WIDGET: title="Out-of-Order Saga State Corruption" metric1="Dual Refund+Ship Anomalies" metric2="Webhook Delivery Latency (s)" threshold="0 State Invariant Violations" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Query Saga state transition audit history for illegal Cancelled -> Paid transitions
psql -h postgres-prod -U principal -d sagadb -c "
SELECT correlation_id, previous_state, new_state, trigger_event, transitioned_at
FROM saga_transition_history
WHERE previous_state = 'Cancelled' AND new_state = 'Paid'
ORDER BY transitioned_at DESC LIMIT 20;"
```

### Observed Culprit Saga Code Snippet
```csharp
// ❌ MISSING CONCURRENCY TOKEN & MISSING LATE-EVENT HANDLER IN 'Cancelled' STATE:
Initially(
    When(OrderSubmitted)
        .TransitionTo(AwaitingPayment));

During(AwaitingPayment,
    When(PaymentTimeoutExpired)
        .TransitionTo(Cancelled), // Marks Cancelled, but what if PaymentCaptured is ALREADY in flight?!
    When(PaymentCaptured)
        .Publish(ctx => new DispatchShipmentCommand(ctx.Saga.CorrelationId))
        .TransitionTo(Paid));

// ❌ If two threads load the Saga in 'AwaitingPayment' at the same millisecond without RowVersion,
// Thread 1 saves 'Cancelled' and Thread 2 overwrites it with 'Paid' 10ms later!
```

<!-- PREDICT_GATE: Commit your hypothesis: How can two events (`PaymentTimeoutExpired` and `PaymentCaptured`) both see the Saga in `AwaitingPayment`, and what must a Saga do when `PaymentCaptured` arrives AFTER `Cancelled`? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Message Queues Never Guarantee Global Event Ordering Across Sources
* `PaymentTimeoutExpired` comes from the internal Quartz/Delayed scheduler queue, while `PaymentCaptured` comes from an external payment webhook HTTP ingress. They travel through completely independent queues and arrive in any order, or at the exact same millisecond on two different pods!

### 2. The Two Mandatory Defenses: RowVersion Concurrency + Tombstone Late-Arrival Handlers
1. **Optimistic Concurrency (`RowVersion` / PostgreSQL `xmin`)**: If Worker A (Timeout) and Worker B (PaymentCaptured) both read the Saga at `Version = 1`, Worker A commits `State = Cancelled, Version = 2`. Worker B's `UPDATE ... WHERE Version = 1` fails with `DbUpdateConcurrencyException`, forcing MassTransit to automatically reload the fresh Saga state (`State = Cancelled, Version = 2`) and re-evaluate `PaymentCaptured` against the `Cancelled` state!
2. **Late-Arrival Compensation inside `During(Cancelled)`**: When `PaymentCaptured` is evaluated against `State = Cancelled`, the state machine must **never** ship the order; it must publish `RefundLateCapturedPaymentCommand`!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using MassTransit;

namespace PrincipalJourney.Messaging.WarRoom;

public sealed class OrderFulfillmentSagaState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = default!;
    public uint RowVersion { get; set; } // Mapped to PostgreSQL 'xmin' concurrency token!
    public string? PaymentIntentId { get; set; }
}

public sealed class ResilientOrderSagaStateMachine : MassTransitStateMachine<OrderFulfillmentSagaState>
{
    public State AwaitingPayment { get; private set; } = default!;
    public State Paid { get; private set; } = default!;
    public State Cancelled { get; private set; } = default!;

    public Event<PaymentCapturedEvent> PaymentCaptured { get; private set; } = default!;
    public Event<PaymentTimeoutExpiredEvent> PaymentTimeoutExpired { get; private set; } = default!;

    public ResilientOrderSagaStateMachine()
    {
        InstanceState(x => x.CurrentState);

        During(AwaitingPayment,
            When(PaymentCaptured)
                .Then(ctx => ctx.Saga.PaymentIntentId = ctx.Message.PaymentIntentId)
                .Publish(ctx => new DispatchShipmentCommand(ctx.Saga.CorrelationId))
                .TransitionTo(Paid),

            When(PaymentTimeoutExpired)
                .Publish(ctx => new ReleaseInventoryReservationCommand(ctx.Saga.CorrelationId))
                .TransitionTo(Cancelled));

        // CRITICAL: Explicitly handle late-arriving PaymentCaptured AFTER timeout cancellation!
        During(Cancelled,
            When(PaymentCaptured)
                .Then(ctx => ctx.Saga.PaymentIntentId = ctx.Message.PaymentIntentId)
                // Order was already cancelled due to timeout! Immediately issue compensating refund; DO NOT SHIP!
                .Publish(ctx => new IssueCompensatingRefundCommand(
                    ctx.Saga.CorrelationId,
                    ctx.Message.PaymentIntentId,
                    Reason: "LatePaymentArrivalAfterOrderTimeout")));
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (No `xmin` + Ignored Late Events) | After (`xmin` Concurrency + `During(Cancelled)` Compensation) | Validation & Rollback Procedure |
|---|---|---|---|
| **Dual Ship+Refund Split-Brain Orders** | `310 orders` (`$148,800` loss) | **`0 orders`** (Mathematically prevented) | Automated MassTransit TestHarness fires `Timeout` and `PaymentCaptured` concurrently; assert `DispatchShipmentCommand` is NOT published if `Cancelled` wins. |
| **Un-Refunded Late Captures** | Silent orphan charges | **100% Auto-Refunded in `< 500ms`** | Reconciliation query asserts 0 `Cancelled` orders with un-refunded `PaymentIntentId`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just increase the payment timeout from 30 seconds to 24 hours so a slow webhook never races with the timeout?"*

**The Principal Defense**:
> *"Holding inventory reservations locked in `AwaitingPayment` for 24 hours on abandoned carts allows a competitor or botnet to add all 10,000 units of a limited-edition product to carts, abandon payment, and **lock out 100% of real buyers for 24 hours (Inventory Denial-of-Service)**! Even with a 24-hour timeout, a webhook delayed to `24h 00m 00.005s` still races! You must handle late-arriving events deterministically in the state machine regardless of timeout duration."*

### Question 2 (The Second-Order Failure Mode):
> *"What if `PaymentCaptured` arrives BEFORE `OrderSubmitted` finishes creating the Saga instance in PostgreSQL?"*

**The Principal Defense**:
> *"That happens frequently when webhooks are faster than internal event buses! In MassTransit, we configure `OnMissingInstance(m => m.ExecuteAsync(ctx => ctx.Redeliver(TimeSpan.FromSeconds(2))))` (or allow `PaymentCaptured` in `Initially` to seed a Tombstone/Pre-Created Saga state) so an early webhook is safely buffered and redelivered 2 seconds later after `OrderSubmitted` commits."*

### Question 3 (The FinOps / Cost Axis):
> *"The architecture team wants to migrate all 12 of our simple 3-step workflows to an Enterprise Managed Temporal / Conductor Cluster ($7,800/month). Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Managed Temporal is fantastic when orchestrating 50-step long-running workflows across polyglot services, but for 3-step event-driven sagas in .NET, **MassTransit State Machines backed by our existing PostgreSQL cluster** costs **$0/month in additional infrastructure**, executes state transitions in `< 3ms`, and lives in the exact same transactional Outbox boundary as our domain database."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0603 — Out-of-Order Saga Zombie Compensation

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 12 minutes | **Mitigation Latency (TTM)**: 19 minutes

## Five Whys Root Cause Chain
1. **Why were 310 orders both shipped and refunded?** -> Both the Timeout branch and the Paid branch executed side effects.
2. **Why did both branches execute?** -> Worker A (Timeout) and Worker B (PaymentCaptured) read the Saga in `AwaitingPayment` concurrently and overwrote each other.
3. **Why did PostgreSQL allow the lost update?** -> The EF Core `SagaStateMachineInstance` mapping omitted `.IsRowVersion()` (`xmin`).
4. **What happened to events arriving 50ms after `Cancelled` was saved?** -> `During(Cancelled)` did not define a compensating handler for late `PaymentCaptured` events.
5. **Why did the Warehouse Lead suspect barcode scanners?** -> Warehouse system only saw valid `DispatchShipmentCommand` messages without Saga state context.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Add `xmin` optimistic concurrency token + `During(Cancelled, When(PaymentCaptured))` refund handler | Order Team | Unit test matrix covers every `(State x Event)` permutation |
| P1 | Add real-time reconciliation alert on `Cancelled` orders with `ShipmentDispatched` | Data Eng | Runs every 5 minutes |
```
