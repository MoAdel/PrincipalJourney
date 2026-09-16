# Learning Objectives & Messaging Competencies

> "A Senior Engineer knows how to push a message to a queue. A Principal Engineer designs the topology such that network drops, server crashes, and duplicate deliveries never corrupt financial state."

---

## 1. Core Competencies Matrix

| Competency Area | Junior / Mid | Senior Engineer | Principal Software Engineer |
|---|---|---|---|
| **Delivery Guarantees** | Assumes "send and receive" works. | Understands At-Least-Once vs At-Most-Once delivery. | Eliminates the Dual-Write problem using Transactional Outbox; guarantees effectively-once processing via consumer idempotency state machines. |
| **Broker Protocols** | Uses high-level SDKs without knowing protocol. | Knows AMQP vs HTTP polling vs Kafka log offsets. | Tunes TCP buffer sizes, AMQP 1.0 credit-based flow control, prefetch count, and connection multiplexing under high load. |
| **Fault Tolerance** | Wraps broker call in simple try-catch. | Configures retry policies with Polly. | Designs Dead-Letter Queues (DLQ), poison message isolation, exponential backoff with decorrelated jitter, and circuit breaker bulkheads to stop retry storms. |
| **Distributed Transactions** | Thinks Distributed Transactions (2PC) work in cloud. | Tries to coordinate multiple HTTP API calls. | Implements Distributed Sagas (Orchestration vs Choreography) with compensating transactions and optimistic concurrency control. |
| **Ordering & Scaling** | Assumes queues are always strict FIFO. | Uses partition keys to maintain per-entity order. | Analyzes the trade-off between throughput and ordering: implements session locks, partition routing, and handles out-of-order execution gracefully. |

---

## 2. Sprint Milestones & Deliverables

By the end of Sprint 06, you will have designed, implemented, and defended:

1. **Transactional Outbox Engine**: An atomic database-to-broker publisher utilizing `System.Threading.Channels` and database row locks (`READPAST` / `FOR UPDATE SKIP LOCKED`) to guarantee zero lost events and zero ghost transactions.
2. **Zero-Allocation In-Memory Pipelines**: Backpressure-aware producer-consumer pipelines using .NET 9 `System.Threading.Channels`.
3. **Idempotent Consumer Harness**: A deduplication engine combining memory-efficient sliding-window Redis hashing and relational uniqueness constraints.
4. **Dead-Letter Redrive Automation**: Poison message quarantine pipelines with automated header inspection and controlled replay.
5. **Distributed Saga Orchestration**: A multi-step saga state machine using MassTransit and Entity Framework Core with compensating transactions.
6. **Claim-Check Large Payload Offloader**: Zero-copy offloading of payloads >256KB to Azure Blob Storage with automated ephemeral SAS token delivery.

---

## 3. Formal & Verified References

* [OASIS: Advanced Message Queuing Protocol (AMQP) Version 1.0](http://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-overview-v1.0-os.html)
* [CNCF Serverless WG: CloudEvents Specification v1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
* [Gregor Hohpe & Bobby Woolf: Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/)
* [Azure Architecture Center: Asynchronous Messaging Options](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/messaging)
