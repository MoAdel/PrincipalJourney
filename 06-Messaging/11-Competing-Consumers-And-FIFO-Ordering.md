# Competing Consumers, Partition Keys & FIFO Ordering

> "You can have global total FIFO ordering, or you can have horizontal scale. You cannot have both across a distributed cluster."

---

## 1. The Ordering vs. Scale Fundamental Law

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Total Strict Global Ordering (Single Consumer)                         │
│ • Producer -> [ Single FIFO Queue ] -> [ 1 Consumer Worker ]           │
│ • Max Throughput: ~2,000 msgs/sec (Bound to single CPU & DB latency).  │
│ • Bottleneck: Any slow message halts ALL processing for all customers. │
├────────────────────────────────────────────────────────────────────────┤
│ Partitioned Ordering (Principal Standard)                              │
│ • Order is only guaranteed PER ENTITY (e.g., per CustomerId/OrderId).  │
│ • Messages are sharded across 16 to 128 physical partitions via Hash.  │
│ • Max Throughput: > 100,000 msgs/sec. Scales linearly with partitions! │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Partition Routing in Azure Service Bus & Kafka

### Azure Service Bus: `SessionId` (Message Sessions)
When using Azure Service Bus, setting `SessionId = customerId` guarantees that a consumer instance acquires an exclusive distributed lock on that customer's messages:

```csharp
var sender = serviceBusClient.CreateSender("orders-topic");
var message = new ServiceBusMessage(body)
{
    SessionId = customerId.ToString(), // Enforces FIFO per customer!
    PartitionKey = customerId.ToString()
};
await sender.SendMessageAsync(message);
```

### RabbitMQ: Single Active Consumer
RabbitMQ provides the `x-single-active-consumer` queue argument: only one worker consumes from the queue at a time, but if it dies, the standby consumer takes over immediately.

---

## 3. Formal & Verified References

* [Enterprise Integration Patterns: Competing Consumers](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CompetingConsumers.html)
* [Microsoft Learn: Message Sessions in Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions)
* [RabbitMQ: Single Active Consumer Specification](https://www.rabbitmq.com/docs/consumers#single-active-consumer)
