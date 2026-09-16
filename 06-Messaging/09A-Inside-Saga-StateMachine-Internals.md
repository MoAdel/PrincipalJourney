# Inside Saga State Machine Internals: MassTransit Automatonymous

> "An orchestrator is not a giant switch statement; it is a deterministic, event-driven finite state machine backed by optimistic database locking."

---

## 1. MassTransit Automatonymous State Machine Architecture

In .NET 9, MassTransit provides a high-performance, strongly typed state machine engine (`MassTransitStateMachine<TSaga>`):

```csharp
public sealed class OrderSagaState : SagaStateMachineInstance, ISagaVersion
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = default!;
    public Guid PaymentId { get; set; }
    public decimal TotalAmount { get; set; }
    public int Version { get; set; } // Optimistic Concurrency Control
}

public sealed class OrderStateMachine : MassTransitStateMachine<OrderSagaState>
{
    public State Submitted { get; private set; } = default!;
    public State Paid { get; private set; } = default!;
    public State Completed { get; private set; } = default!;
    public State Failed { get; private set; } = default!;

    public Event<OrderSubmittedEvent> OrderSubmitted { get; private set; } = default!;
    public Event<PaymentCompletedEvent> PaymentCompleted { get; private set; } = default!;
    public Event<InventoryAllocatedEvent> InventoryAllocated { get; private set; } = default!;
    public Event<InventoryFailedEvent> InventoryFailed { get; private set; } = default!;

    public OrderStateMachine()
    {
        InstanceState(x => x.CurrentState);

        // 1. Correlate incoming events to the Saga Instance
        Event(() => OrderSubmitted, x => x.CorrelateById(m => m.Message.OrderId));
        Event(() => PaymentCompleted, x => x.CorrelateById(m => m.Message.OrderId));
        Event(() => InventoryAllocated, x => x.CorrelateById(m => m.Message.OrderId));
        Event(() => InventoryFailed, x => x.CorrelateById(m => m.Message.OrderId));

        // 2. State Transitions & Orchestration Logic
        Initially(
            When(OrderSubmitted)
                .Then(ctx => ctx.Saga.TotalAmount = ctx.Message.Amount)
                .Publish(ctx => new ProcessPaymentCommand(ctx.Saga.CorrelationId, ctx.Saga.TotalAmount))
                .TransitionTo(Submitted)
        );

        During(Submitted,
            When(PaymentCompleted)
                .Then(ctx => ctx.Saga.PaymentId = ctx.Message.PaymentId)
                .Publish(ctx => new AllocateInventoryCommand(ctx.Saga.CorrelationId))
                .TransitionTo(Paid)
        );

        During(Paid,
            When(InventoryAllocated)
                .Publish(ctx => new ShipOrderCommand(ctx.Saga.CorrelationId))
                .TransitionTo(Completed),

            // Compensation Path
            When(InventoryFailed)
                .Publish(ctx => new RefundPaymentCommand(ctx.Saga.CorrelationId, ctx.Saga.PaymentId))
                .TransitionTo(Failed)
        );
    }
}
```

---

## 2. Optimistic Concurrency & Race Condition Defense

When multiple asynchronous events arrive simultaneously for the same saga instance:
1. EF Core uses the `Version` property (`ISagaVersion`) as a concurrency token (`ROWVERSION` / `xmin`).
2. If two events update the saga state concurrently, the second write throws `DbUpdateConcurrencyException`.
3. MassTransit catches this exception and automatically retries the consumer with an exponential jitter backoff, re-reading the newest state from SQL!

---

## 3. Formal & Verified References

* [MassTransit: State Machine Sagas (Automatonymous)](https://masstransit.io/documentation/patterns/saga/state-machine)
* [Microsoft Learn: Optimistic Concurrency Control in Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/saving/concurrency)
* [Udi Dahan: Sagas in Distributed Systems (NServiceBus)](https://particular.net/blog/what-is-a-saga)
