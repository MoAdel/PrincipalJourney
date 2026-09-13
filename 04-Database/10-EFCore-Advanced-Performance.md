# EF Core Advanced Performance — Compiled Models, Split Queries & Interceptors

> **Core Concept**: Entity Framework Core 9 Performance Engineering  
> How to eliminate ORM overhead, bypass LINQ translation bottlenecks, and eliminate Cartesian explosions.

---

## 1. The Real Cost of EF Core: Change Tracking & The Identity Map

When you execute a standard EF Core query:
```csharp
var orders = await _context.Orders.Include(o => o.Items).ToListAsync();
```
EF Core does significantly more than execute SQL:
1. **Materialization**: Allocates C# entity class instances via reflection/IL.
2. **Snapshot Allocation**: Clones an exact copy of every property value into internal arrays.
3. **Identity Map Insertion**: Tracks every entity reference in `_context.ChangeTracker`.
4. **Relationship Fixup**: Wires up bidirectional foreign key navigation properties.

### The Memory Penalty:
Tracking 10,000 entities can allocate **50 MB to 100 MB of heap memory**, triggering heavy Gen 1/Gen 2 GC collections!

```csharp
// =========================================================================
// 1. ASNOTRACKING & IDENTITY RESOLUTION
// =========================================================================

// STANDARD READ: 0B ChangeTracker allocation!
var orders = await _context.Orders
    .AsNoTracking()
    .ToListAsync();

// READ WITH RELATED DATA (Avoid duplicate object allocation):
// If 100 orders share 5 distinct Customers, AsNoTrackingWithIdentityResolution 
// ensures only 5 Customer objects are instantiated instead of 100 duplicates!
var ordersWithCustomers = await _context.Orders
    .AsNoTrackingWithIdentityResolution()
    .Include(o => o.Customer)
    .ToListAsync();
```

---

## 2. Cartesian Explosion: The Danger of Nested `.Include()`

Suppose an `Order` has 10 `Items` and 5 `StatusHistory` logs:

```csharp
// THE CARTESIAN DISASTER: Single SQL Query with 2 Joins
var order = await _context.Orders
    .Include(o => o.Items)
    .Include(o => o.StatusHistory)
    .FirstOrDefaultAsync(o => o.Id == orderId);
```

### What SQL is Generated?
```sql
SELECT o.*, i.*, s.*
FROM Orders o
LEFT JOIN OrderItems i ON o.Id = i.OrderId
LEFT JOIN OrderStatusHistory s ON o.Id = s.OrderId
WHERE o.Id = @p0;
```

### The Data Explosion:
* The database returns:
  $$1 \text{ Order} \times 10 \text{ Items} \times 5 \text{ History Logs} = \mathbf{50 \text{ Rows!}}$$
* All columns of `Orders` (Customer names, addresses, descriptions) are **repeated 50 times over the network wire**!
* If an order has 50 items and 20 audit events: **1,000 duplicated rows transmitted over the socket**!

---

### The Architectural Solution: Split Queries (`AsSplitQuery`)

```csharp
var order = await _context.Orders
    .AsSplitQuery() // Generates 3 separate, clean queries!
    .Include(o => o.Items)
    .Include(o => o.StatusHistory)
    .FirstOrDefaultAsync(o => o.Id == orderId);
```

### What SQL is Executed?
```sql
-- Query 1: Returns 1 row
SELECT * FROM Orders WHERE Id = @p0;

-- Query 2: Returns 10 rows
SELECT * FROM OrderItems WHERE OrderId = @p0;

-- Query 3: Returns 5 rows
SELECT * FROM OrderStatusHistory WHERE OrderId = @p0;
```
$$\text{Total rows sent over wire: } 1 + 10 + 5 = \mathbf{16 \text{ Rows (vs 50 Rows)!}}$$

> **The Split Query Concurrency Trade-off**:
> If data is being actively modified concurrently without a transaction, Query 2 and Query 3 might observe a newer state than Query 1.  
> **Rule**: Use `AsSplitQuery()` for reads with 2+ one-to-many collections. If strict point-in-time consistency across collections is required, wrap in a transaction.

---

## 3. Compiled Models: Eliminating Startup Reflection (`dotnet ef`)

### The Problem:
When `AppDbContext` starts up on the first request:
EF Core inspects hundreds of entity classes, analyzes attributes, and executes Fluent API `OnModelCreating` to build the in-memory metadata model.
In large enterprise contexts (100+ entities), this takes **1,500 ms to 4,000 ms**, causing terrible server cold-start spikes!

### The Solution:
Pre-compile the entire model at build time into generated C# code:

```bash
dotnet ef dbcontext optimize --output-dir CompiledModels --namespace NovaCommerce.Data.Compiled
```

```csharp
// Program.cs
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(connString)
           .UseModel(NovaCommerce.Data.Compiled.AppDbContextModel.Instance); // 0ms Model Startup!
});
```
* Reduces startup model generation from **2,500 ms to 15 ms**.
* Eliminates reflection overhead and reduces memory footprint by 40%.

---

## 4. Compiled Queries: Bypassing LINQ Expression Parsing

On extreme hot paths (executing 10,000 times/second), converting C# LINQ Expression Trees (`Expression<Func<T, bool>>`) into SQL strings burns precious CPU cycles.

```csharp
public static class CompiledQueries
{
    // Caches the translated SQL statement permanently in a compiled delegate
    private static readonly Func<AppDbContext, int, Task<ProductSummaryDto?>> GetProductByIdCompiled =
        EF.CompileAsyncQuery((AppDbContext context, int productId) =>
            context.Products
                .AsNoTracking()
                .Where(p => p.Id == productId)
                .Select(p => new ProductSummaryDto(p.Id, p.Name, p.Price))
                .FirstOrDefault());

    public static Task<ProductSummaryDto?> GetProductAsync(AppDbContext context, int id)
    {
        return GetProductByIdCompiled(context, id); // Instant execution; 0 LINQ parsing!
    }
}
```
* **Performance Gain**: **2.5x faster** than standard LINQ execution; completely eliminates LINQ compiler allocations.
