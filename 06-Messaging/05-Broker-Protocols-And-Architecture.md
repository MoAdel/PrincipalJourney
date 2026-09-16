# Message Broker Protocols: AMQP 1.0, MQTT & Kafka Log Architecture

> "If you do not understand the transport protocol of your broker, you cannot debug tail latencies, TCP backpressure, or connection pool exhaustion."

---

## 1. Transport Protocols Comparison

| Protocol | Standard Body | Framing Model | Typical Use Case | Overhead |
|---|---|---|---|---|
| **AMQP 1.0** | OASIS / ISO/IEC 19464 | Binary framing over single multiplexed TCP connection. | Enterprise messaging (Azure Service Bus, RabbitMQ, ActiveMQ Artemis). | Extremely low (<50 bytes per frame header). |
| **MQTT 5.0** | OASIS | Ultra-lightweight binary frame (2-byte header). | IoT, mobile telemetry, high-density low-bandwidth sensors. | Minimal (<5 bytes). |
| **Kafka Protocol** | Apache Software Foundation | Custom binary RPC over TCP (Batched RecordSet format). | Distributed log streaming, event sourcing, big-data pipelines. | Zero-copy kernel sendfile streaming. |
| **HTTP/REST (Webhook)**| W3C / IETF | Text/JSON over HTTP/1.1 or HTTP/2. | Public external partner notifications. | High (Headers, TLS handshake, serialization). |

---

## 2. AMQP 1.0 Connection Hierarchy

Unlike HTTP where each request opens a connection (or reuses a persistent socket), AMQP 1.0 multiplexes thousands of logical channels over a single physical TCP connection:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Physical TCP Socket (Port 5671 TLS / 5672 Plaintext)                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ AMQP Connection                                                  │  │
│  │                                                                  │  │
│  │  ┌─────────────────────────┐     ┌─────────────────────────┐     │  │
│  │  │ AMQP Session 1          │     │ AMQP Session 2          │     │  │
│  │  │  ├─ Link 1 (Sender)     │     │  ├─ Link 1 (Sender)     │     │  │
│  │  │  └─ Link 2 (Receiver)   │     │  └─ Link 2 (Receiver)   │     │  │
│  │  └─────────────────────────┘     └─────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

* **Connection**: A single physical full-duplex TCP/TLS socket.
* **Session**: A bidirectional conversation context managing flow control and windowing.
* **Link**: A unidirectional conduit for message delivery (`Source` → `Target`), governed by **Credit-Based Flow Control**.

---

## 3. Technology Selection Matrix: RabbitMQ vs Azure Service Bus vs Kafka

```text
┌───────────────────────────┬─────────────────────┬──────────────────────┬──────────────────────┐
│ Feature                   │ RabbitMQ (Quorum)   │ Azure Service Bus    │ Apache Kafka         │
├───────────────────────────┼─────────────────────┼──────────────────────┼──────────────────────┤
│ Primary Paradigm          │ Smart Broker, Dumb  │ Enterprise Cloud     │ Dumb Broker, Smart   │
│                           │ Consumer (Queues)   │ Messaging (Queues/Top│ Consumer (Commit Log)│
│ Max Message Size          │ 128 MB (Rec: <4 MB) │ 1 MB (Premium: 100MB)│ 1 MB - 20 MB         │
│ Message Deletion          │ On ACK              │ On CompleteAsync     │ Retained by TTL      │
│ Message Ordering          │ FIFO per queue      │ FIFO per SessionId   │ FIFO per Partition   │
│ In-Flight Filtering       │ Topic/Routing Key   │ SQL Rules / Action   │ Consumer-side only   │
│ Best For                  │ Complex routing,    │ Enterprise SaaS,     │ High-scale streaming,│
│                           │ Microservices RPC   │ Banking, Cloud Azure │ Event Sourcing, OLAP │
└───────────────────────────┴─────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 4. Formal & Verified References

* [OASIS: AMQP 1.0 Part 1: Architecture](http://docs.oasis-open.org/amqp/core/v1.0/os/amqp-core-overview-v1.0-os.html)
* [RabbitMQ: Quorum Queues Internals (Raft Consensus)](https://www.rabbitmq.com/docs/quorum-queues)
* [Azure Service Bus: AMQP 1.0 in Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-amqp-overview)
