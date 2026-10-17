# Hands-On Messaging Architecture Labs

> "Theoretical understanding of messaging means nothing until you simulate a network partition, kill a consumer pod, and prove that zero duplicate charges occur."

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Transactional Outbox Publisher with EF Core & SQL Server

### Objective
Implement an atomic outbox publisher in .NET 9 that saves domain entities and outbox messages in a single transaction, using a background worker with `UPDLOCK, READPAST`.

### Verification Steps
1. Insert 5,000 orders concurrently across 10 threads.
2. Simulate a broker outage (pause RabbitMQ container).
3. Verify that all 5,000 orders commit in SQL, but outbox status remains pending.
4. Unpause RabbitMQ; verify that the outbox worker dispatches all 5,000 messages without dropping any.

---

## Lab 2: Idempotent Consumer Engine with MassTransit & PostgreSQL

### Objective
Create an idempotent consumer using the MassTransit Outbox/Inbox middleware backed by PostgreSQL.

### Verification Steps
1. Publish duplicate messages (same `MessageId`, same payload) 20 times in rapid succession.
2. Verify that the database business logic executes exactly once.
3. Verify that all 20 messages receive an immediate ACK and are deleted from the broker.

---

## Lab 3: Zero-Allocation In-Memory Channel Pipeline with Bounded Backpressure

### Objective
Build a high-throughput telemetry ingestion pipeline using `System.Threading.Channels` with 10 producers and 2 background batching consumers.

### Verification Steps
1. Run a 30-second benchmark pushing 100,000 items/sec.
2. Verify with `dotnet-counters` that GC Gen 2 allocations remain zero.
3. Test buffer saturation: observe that producers pause asynchronously without throwing exceptions or leaking memory.

---

## Lab 4: MassTransit Saga State Machine with Compensating Transactions

### Objective
Design an `OrderStateMachine` orchestrating Order Creation, Payment Processing, and Inventory Allocation.

### Verification Steps
1. Inject a failure into the Inventory Allocation service (simulate out of stock).
2. Verify that the saga transitions to the `Failed` state.
3. Verify that the compensating `RefundPaymentCommand` is published and executed automatically.

---

## Lab 5: Dead-Letter Queue Redrive Utility

### Objective
Construct an automated utility that inspects messages in Azure Service Bus / RabbitMQ DLQ, audits failure reasons, and replays them back to the active queue.
