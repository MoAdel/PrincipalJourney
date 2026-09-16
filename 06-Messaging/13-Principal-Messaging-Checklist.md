# Principal Messaging & Queueing Production Release Checklist

> "An architect does not sign off on a messaging deployment because it works in development; they sign off when the failure modes are isolated, monitored, and automated."

---

## 1. Reliability & Delivery Invariants
- [ ] **Dual-Write Elimination**: No direct broker calls inside or immediately after local database commits. Transactional Outbox pattern implemented.
- [ ] **Consumer Idempotency**: All message consumers enforce deduplication via relational Inbox unique constraints or natural domain idempotency.
- [ ] **Bounded In-Flight Leases**: Consumer message lock durations are configured to allow $3	imes$ the $p99$ processing time before lease expiration.
- [ ] **Non-Blocking Outbox Dispatch**: Outbox worker queries use `WITH (UPDLOCK, READPAST)` or `FOR UPDATE SKIP LOCKED`.

## 2. Broker Topology & Sizing
- [ ] **Prefetch Count Calibration**: Prefetch is tuned per workload (1-5 for heavy operations, 50-200 for fast operations).
- [ ] **Dead-Letter Isolation**: Every production queue has a dedicated Dead-Letter Queue (DLQ) with automated alert thresholds.
- [ ] **Poison Pill Elimination**: Terminal deserialization or schema errors bypass retries and are sent directly to DLQ.
- [ ] **Backpressure Configuration**: In-memory channels are strictly bounded with `BoundedChannelFullMode.Wait` to prevent heap exhaustion.

## 3. Distributed Transactions & Sagas
- [ ] **Compensation Path Tested**: Every forward saga step ($T_i$) has an automated integration test verifying its compensating action ($C_i$).
- [ ] **Optimistic Concurrency Protection**: Saga state records use version tokens (`ROWVERSION` / `ISagaVersion`) to reject conflicting concurrent transitions.
- [ ] **Semantic Locking**: Resources in flight during a saga are marked `Pending` to prevent dirty reads.

## 4. Observability & Operational Runbooks
- [ ] **Distributed Correlation**: W3C `traceparent` and custom `CorrelationId` propagate across all messages and consumer scopes.
- [ ] **Queue Depth Metrics**: Alerts trigger when queue backlog exceeds 10,000 messages or $p99$ delivery latency exceeds 500ms.
- [ ] **Automated DLQ Redrive**: A tested CLI tool or service exists to replay messages from DLQ to the primary queue with audit logging.
