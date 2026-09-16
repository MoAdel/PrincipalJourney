# Principal Technical Interview Scenarios: Asynchronous Messaging

> "In a Staff/Principal interview, the interviewer will intentionally inject network partitions and poison pills into your whiteboard design to test your engineering reflexes."

---

### Interview Challenge 1: Design a Financial Payment Ingestion Platform
**Constraint**: 50,000 transactions per second. Zero duplicate charges allowed under any failure mode. Third-party bank APIs have 300ms latency.

**Key Architecture Points to Cover**:
1. Ingestion via Minimal APIs into Bounded `System.Threading.Channels` with backpressure.
2. Transactional Outbox storing payment intent in relational database with unique idempotency key.
3. Asynchronous dispatch to Azure Service Bus / RabbitMQ Quorum Queues with partition routing on `AccountId`.
4. Idempotent consumer cluster using Redis sliding-window distributed lock + SQL unique constraint check.
5. Sagas coordinating Pre-Auth → Fraud Check → Capture → Settlement with automated rollback.

---

### Interview Challenge 2: Debugging High Consumer Lag
**Scenario**: Telemetry shows queue backlog grew from 1,000 to 800,000 messages in 30 minutes. CPU on worker nodes is at 15%. What is the diagnostic workflow?

**Principal Diagnostic Steps**:
1. **Analyze Worker CPU vs Thread State**: 15% CPU with high lag indicates workers are blocked on I/O (Sync-over-async or thread pool exhaustion) or waiting on database locks.
2. **Inspect Prefetch Count**: A high prefetch count with slow downstream APIs causes a few workers to hold hundreds of unacknowledged messages while remaining workers sit idle.
3. **Check Database Lock Contention**: Verify if consumers are contending for the same table rows (e.g., updating a shared customer balance without row-level locking).
4. **Inspect DLQ & Error Rates**: Verify if poison pills are causing consumers to repeatedly retry and timeout.
