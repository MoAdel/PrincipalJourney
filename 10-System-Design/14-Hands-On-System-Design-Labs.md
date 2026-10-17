# Production Hands-On System Design Labs

These 5 hands-on labs provide production-grade, executable implementations of core distributed system design patterns.

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Consistent Hash Ring with Virtual Nodes in C# 13 (.NET 9)

### Objective
Implement a production-grade consistent hashing ring that maps keys across distributed cache/database nodes with virtual nodes to eliminate hot spots.

```csharp
using System.Security.Cryptography;
using System.Text;

namespace Enterprise.SystemDesign.Labs;

public class ConsistentHashRing<TNode>
{
    private readonly SortedDictionary<uint, TNode> _ring = new();
    private readonly int _vNodesPerPhysicalNode;

    public ConsistentHashRing(int vNodesPerPhysicalNode = 100)
    {
        _vNodesPerPhysicalNode = vNodesPerPhysicalNode;
    }

    public void AddNode(TNode node)
    {
        for (int i = 0; i < _vNodesPerPhysicalNode; i++)
        {
            var vNodeKey = $"{node?.ToString()}:vnode:{i}";
            var hash = MurmurHash3(vNodeKey);
            _ring[hash] = node!;
        }
    }

    public void RemoveNode(TNode node)
    {
        for (int i = 0; i < _vNodesPerPhysicalNode; i++)
        {
            var vNodeKey = $"{node?.ToString()}:vnode:{i}";
            var hash = MurmurHash3(vNodeKey);
            _ring.Remove(hash);
        }
    }

    public TNode GetNode(string routingKey)
    {
        if (_ring.Count == 0) throw new InvalidOperationException("Ring is empty.");

        var hash = MurmurHash3(routingKey);

        // Find the first node on the ring with hash >= key hash
        foreach (var entry in _ring)
        {
            if (entry.Key >= hash)
            {
                return entry.Value;
            }
        }

        // Wrap around to the start of the ring
        return _ring.First().Value;
    }

    private static uint MurmurHash3(string input)
    {
        var bytes = Encoding.UTF8.GetBytes(input);
        var hashBytes = SHA256.HashData(bytes);
        return BitConverter.ToUInt32(hashBytes, 0);
    }
}
```

---

## Lab 2: Atomic Sliding-Window Rate Limiter using StackExchange.Redis

### Objective
Implement an atomic sliding-window counter rate limiter in C# that coordinates across multiple API Gateway pods using Redis.

```csharp
using StackExchange.Redis;

namespace Enterprise.SystemDesign.Labs;

public class RedisSlidingWindowRateLimiter
{
    private readonly IConnectionMultiplexer _redis;
    private const string LuaScript = @"
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local clearBefore = now - window

        redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
        local currentRequests = redis.call('ZCARD', key)

        if currentRequests < limit then
            redis.call('ZADD', key, now, now)
            redis.call('PEXPIRE', key, window)
            return 1
        else
            return 0
        end
    ";

    public RedisSlidingWindowRateLimiter(IConnectionMultiplexer redis) => _redis = redis;

    public async Task<bool> IsAllowedAsync(string clientId, int maxRequests, TimeSpan window)
    {
        var db = _redis.GetDatabase();
        var key = $"rate_limit:{clientId}";
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var windowMs = (long)window.TotalMilliseconds;

        var result = (int)await db.ScriptEvaluateAsync(
            LuaScript,
            new RedisKey[] { key },
            new RedisValue[] { nowMs, windowMs, maxRequests });

        return result == 1;
    }
}
```

---

## Lab 3: Transactional Outbox Pattern with Relational Deduplication

### Objective
Implement the Transactional Outbox and Inbox patterns to guarantee reliable message delivery and idempotent consumption without two-phase commit.

```csharp
using System.Data;
using Microsoft.Data.SqlClient;

namespace Enterprise.SystemDesign.Labs;

public record OutboxMessage(Guid Id, string Topic, string Payload, DateTime CreatedAtUtc);

public class OutboxProcessor
{
    private readonly string _connectionString;

    public OutboxProcessor(string connectionString) => _connectionString = connectionString;

    public async Task SaveOrderWithOutboxAsync(Guid orderId, string customerId, decimal total, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);

        try
        {
            // 1. Insert Order
            await using var cmdOrder = new SqlCommand(
                "INSERT INTO Orders (Id, CustomerId, Total) VALUES (@Id, @CustId, @Total)", 
                conn, (SqlTransaction)tx);
            cmdOrder.Parameters.AddWithValue("@Id", orderId);
            cmdOrder.Parameters.AddWithValue("@CustId", customerId);
            cmdOrder.Parameters.AddWithValue("@Total", total);
            await cmdOrder.ExecuteNonQueryAsync(ct);

            // 2. Insert Outbox Event in the SAME ACID transaction
            var outboxPayload = $"{{"orderId":"{orderId}","total":{total}}}";
            await using var cmdOutbox = new SqlCommand(
                "INSERT INTO OutboxMessages (Id, Topic, Payload, CreatedAtUtc) VALUES (@Id, @Topic, @Payload, @Created)",
                conn, (SqlTransaction)tx);
            cmdOutbox.Parameters.AddWithValue("@Id", Guid.NewGuid());
            cmdOutbox.Parameters.AddWithValue("@Topic", "order.created");
            cmdOutbox.Parameters.AddWithValue("@Payload", outboxPayload);
            cmdOutbox.Parameters.AddWithValue("@Created", DateTime.UtcNow);
            await cmdOutbox.ExecuteNonQueryAsync(ct);

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }
}
```

---

## Lab 4: Multi-Tier Cache with Single-Flight Invalidation

### Objective
Implement a multi-tier cache (L1 MemoryCache + L2 Redis) with a single-flight mutex to eliminate cache stampedes upon expiration.

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace Enterprise.SystemDesign.Labs;

public class MultiTierCache
{
    private readonly IMemoryCache _l1;
    private readonly IDatabase _l2;
    private readonly ConcurrentDictionary<string, Task<string?>> _singleFlight = new();

    public MultiTierCache(IMemoryCache l1, IConnectionMultiplexer redis)
    {
        _l1 = l1;
        _l2 = redis.GetDatabase();
    }

    public async Task<string?> GetAsync(string key, Func<Task<string>> databaseFallback, TimeSpan l1Ttl, TimeSpan l2Ttl)
    {
        // 1. Check L1 Memory Cache
        if (_l1.TryGetValue(key, out string? l1Value))
        {
            return l1Value;
        }

        // 2. Single-Flight Mutex for L2 and DB Fallback
        var fetchTask = _singleFlight.GetOrAdd(key, async _ =>
        {
            // Check L2 Redis
            var l2Value = await _l2.StringGetAsync(key);
            if (!l2Value.IsNullOrEmpty)
            {
                _l1.Set(key, (string)l2Value!, l1Ttl);
                return (string)l2Value!;
            }

            // Fallback to Primary Database
            var dbValue = await databaseFallback();
            if (dbValue is not null)
            {
                await _l2.StringSetAsync(key, dbValue, l2Ttl);
                _l1.Set(key, dbValue, l1Ttl);
            }
            return dbValue;
        });

        try
        {
            return await fetchTask;
        }
        finally
        {
            _singleFlight.TryRemove(key, out _);
        }
    }
}
```

---

## Lab 5: Automated Back-of-the-Envelope Capacity Estimator CLI

### Objective
Author a C# command-line tool that calculates QPS, bandwidth, and storage requirements from user-supplied parameters.

```csharp
namespace Enterprise.SystemDesign.Labs;

public static class CapacityCalculator
{
    public static void Calculate(long dailyActiveUsers, int actionsPerUser, int payloadBytes)
    {
        long dailyTotal = dailyActiveUsers * actionsPerUser;
        double avgQps = dailyTotal / 86400.0;
        double peakQps = avgQps * 2.0;

        double dailyStorageBytes = dailyTotal * (double)payloadBytes;
        double dailyStorageGb = dailyStorageBytes / (1024 * 1024 * 1024);
        double annualStorageTb = (dailyStorageBytes * 365) / (1024L * 1024 * 1024 * 1024);

        double bandwidthGbps = (avgQps * payloadBytes * 8) / 1_000_000_000.0;

        Console.WriteLine($"=== Capacity Estimation Results ===");
        Console.WriteLine($"Daily Total Operations : {dailyTotal:N0}");
        Console.WriteLine($"Average QPS            : {avgQps:N2} req/sec");
        Console.WriteLine($"Peak QPS (2x)          : {peakQps:N2} req/sec");
        Console.WriteLine($"Daily Storage Growth   : {dailyStorageGb:N2} GB/day");
        Console.WriteLine($"Annual Storage Growth  : {annualStorageTb:N2} TB/year");
        Console.WriteLine($"Required Bandwidth     : {bandwidthGbps:N3} Gbps");
    }
}
```
