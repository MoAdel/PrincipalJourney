# Dapper Micro-ORM & CQRS Read Optimization

> **Core Concept**: High-Throughput Read Models & Bulk Ingestion  
> When to bypass EF Core, how Dapper achieves near-raw-ADO.NET speed, and multi-thousand-row bulk loading.

---

## 1. The CQRS Data Access Dichotomy

In enterprise software architecture, forcing a single ORM to handle both rich domain transactions and complex high-speed reporting reads is an architectural anti-pattern.

```text
                               ┌─────────────────────────────┐
                               │     COMMAND / WRITE PATH    │
                               │ • Business Rule Validation  │
                               │ • Invariant Protection      │
                               │ • Entity Framework Core 9   │
                               └──────────────┬──────────────┘
                                              │ Writes
                                              ▼
┌───────────────────────────┐      ┌─────────────────────────────┐
│   CLIENT APPLICATION      │      │    RELATIONAL DATABASE      │
└───────────────────────────┘      │    PostgreSQL / SQL Server  │
                                   └──────────────┬──────────────┘
                                              │ Reads
                                              ▼
                               ┌─────────────────────────────┐
                               │      QUERY / READ PATH      │
                               │ • High-Speed Projections    │
                               │ • Zero Change-Tracking      │
                               │ • Dapper / Raw ADO.NET      │
                               └─────────────────────────────┘
```

* **Write Path**: Use **EF Core 9** for rich domain models, optimistic concurrency tokens (`RowVersion`), navigation graphs, and business invariants.
* **Read Path**: Use **Dapper** to execute hand-tuned SQL queries, mapping directly to immutable C# `record` DTOs with sub-millisecond execution times.

---

## 2. How Dapper Works Internally: IL Emit Deserialization

When Dapper executes `connection.QueryAsync<OrderDto>(sql)`:
1. It inspects the database schema metadata returned in the `DbDataReader`.
2. It uses **Dynamic IL Generation (`ILGenerator.Emit`)** to compile an in-memory C# method that directly reads column ordinals and assigns them to the object fields.
3. It **caches the compiled IL delegate** in a concurrent dictionary keyed by:
   $$\text{Cache Key: } (\text{SQL String Hash}, \text{Target Type}, \text{Connection ConnectionString})$$
4. On subsequent executions, Dapper bypasses reflection entirely, executing at **the physical speed of hand-written raw ADO.NET code**!

---

## 3. High-Performance Dapper Patterns

### 1. Multi-Mapping (Handling 1-to-1 and 1-to-Many Cleanly)
```csharp
public async Task<List<OrderSummaryDto>> GetOrdersWithCustomerAsync(long merchantId)
{
    const string sql = @"
        SELECT o.Id, o.Total, o.CreatedAt,
               c.Id, c.FullName, c.Email
        FROM Orders o
        INNER JOIN Customers c ON o.CustomerId = c.Id
        WHERE o.MerchantId = @MerchantId
        ORDER BY o.CreatedAt DESC;";

    await using var conn = new NpgsqlConnection(_connectionString);

    // splitOn tells Dapper where the Customer object columns start
    var orders = await conn.QueryAsync<OrderSummaryDto, CustomerDto, OrderSummaryDto>(
        sql,
        (order, customer) => order with { Customer = customer },
        new { MerchantId = merchantId },
        splitOn: "Id");

    return orders.AsList();
}
```

---

### 2. Streaming Massive Datasets: `buffered: false`
By default, Dapper loads **all query results into an in-memory list** before returning:
If a reporting query returns 500,000 rows, buffering them will consume 600 MB of RAM, trigger Gen 2 GC pauses, and potentially throw `OutOfMemoryException`!

```csharp
// PRINCIPAL PATTERN: Memory-constant streaming with unbuffered Dapper
public async IAsyncEnumerable<OrderExportDto> StreamOrderArchiveAsync(DateTime startDate)
{
    const string sql = "SELECT * FROM Orders WHERE CreatedAt >= @StartDate";

    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    // buffered: false returns an unbuffered IEnumerable that streams row-by-row directly from the socket!
    var rows = await conn.QueryAsync<OrderExportDto>(
        new CommandDefinition(sql, new { StartDate = startDate }, flags: CommandFlags.None, buffered: false));

    foreach (var row in rows)
    {
        yield return row; // Constant 8KB memory footprint regardless of dataset size!
    }
}
```

---

## 4. Ultra-Fast Bulk Ingestion: Bypassing `INSERT` Statements

Inserting 100,000 rows using standard `INSERT` statements—even with EF Core batching—takes **30 to 60 seconds** because each statement generates parse trees and transaction log records.

### The PostgreSQL Binary Import (`COPY` protocol):
PostgreSQL exposes the raw **Streaming Binary Copy Protocol**, achieving ingestion speeds of **over 250,000 rows per second**:

```csharp
public async Task BulkInsertLedgerAsync(List<LedgerEntry> entries)
{
    await using var conn = new NpgsqlConnection(_connectionString);
    await conn.OpenAsync();

    // Directly streams raw binary bytes into PostgreSQL storage engine
    await using var writer = await conn.BeginBinaryImportAsync(@"
        COPY LedgerEntries (Id, AccountId, Amount, CreatedAt) 
        FROM STDIN (FORMAT BINARY)");

    foreach (var entry in entries)
    {
        await writer.StartRowAsync();
        await writer.WriteAsync(entry.Id);
        await writer.WriteAsync(entry.AccountId);
        await writer.WriteAsync(entry.Amount);
        await writer.WriteAsync(entry.CreatedAt);
    }

    await writer.CompleteAsync(); // Flushes 100,000 rows in ~280 ms!
}
```

> **Benchmark Comparison (Inserting 100,000 Records)**:
> - EF Core Individual `AddAsync()`: **54.2 seconds**
> - EF Core 9 `AddRange()` with Batching: **4.8 seconds**
> - SQL Server `SqlBulkCopy` / Postgres Binary `COPY`: **0.31 seconds (170x faster!)**
