# Dead-Letter Queues (DLQ) & Retry Storm Prevention

> "Unbounded immediate retries convert a minor downstream latency blip into a catastrophic, company-wide cascading outage."

---

## 1. Transient vs. Terminal Errors

When a consumer encounters an exception, it must classify the failure before deciding to retry:

```mermaid
flowchart TD
    Err[Message Processing Throws Exception] --> Classify{Classify Exception Type}
    
    Classify -->|Transient Failure| Transient[Network Timeout / 503 Service Unavailable / SQL Deadlock]
    Classify -->|Terminal Failure| Poison[NullReference / Deserialization Failure / Invalid Schema / 400 Bad Request]

    Transient --> RetryCheck{Retry Count < MaxLimit?}
    RetryCheck -->|Yes| Backoff[Exponential Backoff + Decorrelated Jitter]
    Backoff --> ReEnqueue[Re-queue / Delay Schedule]

    RetryCheck -->|No (Exhausted)| Quarantine[Dead-Letter Queue - DLQ]
    Poison -->|Immediate| Quarantine
```

---

## 2. The Mechanics of a Retry Storm

Imagine an inventory database slows down, taking 2.5 seconds per query instead of 10ms.
1. 100 workers time out and immediately retry.
2. The incoming message stream continues arriving at 2,000 msgs/sec.
3. Retrying workers double the incoming load on the struggling database: $2,000	ext{ new} + 2,000	ext{ retries} = 4,000	ext{ requests/sec}$.
4. The database hits 100% CPU and completely collapses.
5. All 10,000 in-flight messages exhaust retries simultaneously and flood the Dead-Letter Queue.

### Mitigation: Decorrelated Jitter Backoff
Never retry at fixed intervals ($1s, 2s, 4s$). Always inject random entropy:

$$t_{sleep} = \min(t_{max}, 	ext{Random}(t_{base}, t_{prev} 	imes 3))$$

---

## 3. Production DLQ Redrive Architecture (.NET 9)

```csharp
public sealed class DeadLetterRedriveService
{
    private readonly ServiceBusClient _client;
    private readonly ILogger<DeadLetterRedriveService> _logger;

    public DeadLetterRedriveService(ServiceBusClient client, ILogger<DeadLetterRedriveService> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task RedriveMessagesAsync(string queueName, int batchSize, CancellationToken ct)
    {
        var dlqReceiver = _client.CreateReceiver(
            queueName, 
            new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
        
        var mainSender = _client.CreateSender(queueName);

        IReadOnlyList<ServiceBusReceivedMessage> messages;
        do
        {
            messages = await dlqReceiver.ReceiveMessagesAsync(batchSize, TimeSpan.FromSeconds(3), ct);
            
            foreach (var msg in messages)
            {
                // Inspect DLQ headers
                var reason = msg.DeadLetterReason;
                var description = msg.DeadLetterErrorDescription;

                _logger.LogInformation("Redriving message {MessageId}. Original DLQ Reason: {Reason}", msg.MessageId, reason);

                // Clone message for re-injection
                var redriveMsg = new ServiceBusMessage(msg.Body)
                {
                    MessageId = msg.MessageId,
                    CorrelationId = msg.CorrelationId
                };
                redriveMsg.ApplicationProperties["RedriveCount"] = 1;

                // Send back to main queue
                await mainSender.SendMessageAsync(redriveMsg, ct);
                
                // Complete from DLQ
                await dlqReceiver.CompleteMessageAsync(msg, ct);
            }
        } while (messages.Count > 0 && !ct.IsCancellationRequested);
    }
}
```

---

## 4. Formal & Verified References

* [Enterprise Integration Patterns: Dead Letter Channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html)
* [AWS Architecture Blog: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
* [Microsoft Learn: Service Bus Dead-Letter Queues Overview](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
