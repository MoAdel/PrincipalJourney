# Curated Messaging Learning Resources & Official Specifications

> "Authoritative knowledge comes from primary specifications and architectural literature, not third-party blog summaries."

---

## 1. Authoritative Protocol Specifications & Standards

* **AMQP 1.0 Specification (OASIS Standard)**:
  * [AMQP Version 1.0 Part 1: Architecture](http://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-overview-v1.0-os.html)
  * [AMQP Version 1.0 Part 2: Transport & Flow Control](http://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-transport-v1.0-os.html)
  * [AMQP Version 1.0 Part 3: Messaging](http://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-messaging-v1.0-os.html)
* **CloudEvents Specification**:
  * [CloudEvents v1.0.2 - CNCF Serverless Working Group](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
* **RFC Standards**:
  * [RFC 2119: Key words for use in RFCs to Indicate Requirement Levels](https://www.ietf.org/rfc/rfc2119.txt)
  * [RFC 9110: HTTP Semantics (Idempotency Specifications)](https://www.rfc-editor.org/rfc/rfc9110.html)

---

## 2. Definitive Architectural Literature

* **Gregor Hohpe & Bobby Woolf**: *Enterprise Integration Patterns: Designing, Building, and Deploying Messaging Solutions* (Addison-Wesley).
* **Martin Kleppmann**: *Designing Data-Intensive Applications: The Big Ideas Behind Reliable, Scalable, and Maintainable Systems* (O'Reilly).
* **Chris Richardson**: *Microservices Patterns: With Examples in Java* (Manning) — Chapters 3 & 4 (Inter-process communication & Sagas).
* **Hector Garcia-Molina & Kenneth Salem**: *Sagas* (ACM 1987 Original Research Paper).

---

## 3. Official Platform & Library Architecture Guides

* **Microsoft Azure Architecture Center**:
  * [Asynchronous Messaging Options in Azure](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/messaging)
  * [Transactional Outbox Pattern Guidance](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transactional-outbox)
  * [Compensating Transaction Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
  * [Claim-Check Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/claim-check)
* **MassTransit Official Documentation**:
  * [MassTransit Architecture, Transports & Sagas](https://masstransit.io/documentation/patterns/saga)
* **RabbitMQ Engineering Guides**:
  * [RabbitMQ Quorum Queues Internals](https://www.rabbitmq.com/docs/quorum-queues)
