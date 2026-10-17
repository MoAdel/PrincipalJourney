# Hands-On Database Architecture Labs

> **Practical Engineering Labs**: 6 Real-World Database Performance Challenges  
> Complete code implementations, SQL scripts, and verification steps.

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Eliminating Key Lookups with Covering Indexes

### The Scenario:
The product catalog endpoint `GET /api/v1/products?categoryId=42` is consuming 80% of database CPU under load.
Inspecting the execution plan reveals an **Index Seek** on `IX_Products_CategoryId` followed by a massive **Key Lookup (Clustered)** on `PK_Products` reading 40,000 rows.

### 1. The Broken State
```sql
-- Existing non-covering index
CREATE NONCLUSTERED INDEX IX_Products_CategoryId ON Products (CategoryId);

-- Query executed by EF Core:
SELECT Id, CategoryId, Name, Price, Sku 
FROM Products 
WHERE CategoryId = 42;
```
* **Bottleneck**: Because `Name`, `Price`, and `Sku` are missing from the index, the database performs **40,000 separate random page lookups** into the Clustered Index!

### 2. The Principal Refactor
```sql
-- Replace with Covering Index with INCLUDE columns:
DROP INDEX IX_Products_CategoryId ON Products;

CREATE NONCLUSTERED INDEX IX_Products_CategoryId_Covering 
ON Products (CategoryId)
INCLUDE (Name, Price, Sku);
```

### 3. Verification:
Run with `SET STATISTICS IO ON`:
* **Before**: `Table 'Products'. Scan count 1, logical reads 42,850.`
* **After**: `Table 'Products'. Scan count 1, logical reads 18.` (99.9% reduction in I/O!).

---

## Lab 2: Eliminating TempDB Sort Spills

### The Scenario:
A high-frequency query ordering customer orders triggers a **Sort Warning (Level 1 Spill to TempDB)**:

```sql
SELECT OrderId, CustomerId, Total, CreatedAt 
FROM Orders 
WHERE CustomerId = 1054
ORDER BY CreatedAt DESC;
```

### 1. Why it Spilled:
The existing index is on `(CustomerId)`. The engine finds all matching rows, loads them into workspace memory, and executes an in-memory **Sort operator**. Because cardinality was underestimated, the memory grant overflows into `tempdb`.

### 2. The Principal Refactor:
```sql
-- Design the index to provide physical sort order for free!
CREATE NONCLUSTERED INDEX IX_Orders_Customer_CreatedAt 
ON Orders (CustomerId, CreatedAt DESC)
INCLUDE (Total);
```

### 3. Verification:
Re-run the execution plan:
* The **Sort operator vanishes completely**!
* The database engine streams rows directly from the leaf pages in physical sort order ($O(1)$ memory cost; 0 bytes TempDB usage).

---

## Lab 3: Deadlock Reproduction & Deterministic Sorting

### The Scenario:
Two concurrent background workers are updating inventory balances for multi-product orders, causing frequent Deadlock exceptions (`1205`).

### 1. The Broken Code (Unordered):
```csharp
public async Task DeductStockUnorderedAsync(List<int> productIds, int qty)
{
    await using var tx = await _context.Database.BeginTransactionAsync();
    foreach (var id in productIds) // Processes in whatever random order the cart had
    {
        await _context.Database.ExecuteSqlRawAsync(
            "UPDATE Products SET Stock = Stock - {0} WHERE Id = {1}", qty, id);
    }
    await tx.CommitAsync();
}
```

### 2. The Principal Refactor (Deterministic Sorting):
```csharp
public async Task DeductStockDeterministicAsync(List<int> productIds, int qty)
{
    // CRITICAL: Sort deterministically to prevent cyclic lock dependency
    var sortedIds = productIds.Distinct().OrderBy(id => id).ToList();

    await using var tx = await _context.Database.BeginTransactionAsync();
    foreach (var id in sortedIds)
    {
        // Enforce RowLock and UpdLock to prevent conversion deadlocks
        await _context.Database.ExecuteSqlRawAsync(
            "UPDATE Products WITH (UPDLOCK, ROWLOCK) SET Stock = Stock - {0} WHERE Id = {1}", 
            qty, id);
    }
    await tx.CommitAsync();
}
```

---

## Lab 4: Connection Pool Exhaustion Drill

### The Scenario:
Simulate 500 concurrent requests against an application configured with `MaxPoolSize=50`.
Observe connection starvation, then eliminate it by implementing strict query timeouts and connection reuse.

```csharp
// Program.cs
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("Database"), npgsqlOptions =>
    {
        npgsqlOptions.CommandTimeout(5); // 5s timeout on queries
    });
}, poolSize: 64); // DbContext pooling avoids object recreation allocations!
```

---

## Lab 5: EF Core 9 Compiled Models & Split Query Benchmarks

### 1. Generate Compiled Model:
```bash
dotnet ef dbcontext optimize --output-dir Data/Compiled --namespace NovaCommerce.Data.Compiled
```

### 2. Configure Split Query Globally:
```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(connString, o => o.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery))
           .UseModel(NovaCommerce.Data.Compiled.AppDbContextModel.Instance);
});
```

---

## Lab 6: Ultra-Fast Streaming Ingestion via Dapper

```csharp
public async Task BulkInsertLedgerAsync(IEnumerable<LedgerRecord> records)
{
    const string sql = @"
        INSERT INTO LedgerEntries (Id, AccountId, Amount, CreatedAt)
        VALUES (@Id, @AccountId, @Amount, @CreatedAt);";

    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    // Dapper executes in optimized parameterized internal batches
    await conn.ExecuteAsync(sql, records);
}
```
