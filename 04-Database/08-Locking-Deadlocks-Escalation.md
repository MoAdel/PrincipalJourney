# Locking, Deadlocks & Lock Escalation — Concurrency Engineering

> **Core Concept**: Database Locking Mechanics  
> How relational engines protect data integrity under concurrent writes, and how to eliminate blocking chains and deadlocks.

---

## 1. The Lock Hierarchy & Lock Modes

Relational engines implement a strict **Lock Granularity Hierarchy**:

$$\text{Database} \longrightarrow \text{Table} \longrightarrow \text{Extent (64KB)} \longrightarrow \text{Page (8KB)} \longrightarrow \text{Row / Key}$$

### The Core Lock Modes:

```text
┌───────────────────┬─────────────────────────────────────────────────────────────┐
│     Lock Mode     │                         Description                         │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Shared (S)        │ Acquired for read operations. Multiple S locks can coexist. │
│ Exclusive (X)     │ Acquired for writes (INSERT, UPDATE, DELETE). Total lock.   │
│ Update (U)        │ Hybrid lock: acquired during search phase before update.    │
│ Intent Shared(IS) │ Placed on parent levels (Table/Page) indicating child has S.│
│ Intent Excl (IX)  │ Placed on parent levels (Table/Page) indicating child has X.│
└───────────────────┴─────────────────────────────────────────────────────────────┘
```

### Why Intent Locks (IS, IX) Exist:
Suppose Transaction A holds an **Exclusive (X) Lock** on Row 42.
Now Transaction B arrives and requests a **Table-Level Exclusive Lock** on the entire table.
Without Intent Locks, Transaction B would have to physically inspect every single row in the table to check if anyone holds a row lock!
Because Transaction A placed an **Intent Exclusive (IX)** lock on the table header when it locked Row 42, Transaction B simply checks the table header, sees `IX`, and waits immediately ($O(1)$ check).

---

## 2. Lock Compatibility Matrix

```text
               Existing Lock Held on Resource
Requested  │   S   │   X   │   U   │  IS   │  IX  
───────────┼───────┼───────┼───────┼───────┼───────
    S      │  YES  │  NO   │  YES  │  YES  │  NO  
    X      │  NO   │  NO   │  NO   │  NO   │  NO  
    U      │  YES  │  NO   │  NO   │  YES  │  NO  
   IS      │  YES  │  NO   │  YES  │  YES  │  YES 
   IX      │  NO   │  NO   │  NO   │  YES  │  YES 
```

> **The Power of Update (U) Locks**:
> When an `UPDATE` executes, it first reads the row. If it takes an `S` lock and then converts to `X`, two concurrent transactions can both take `S` locks and then both wait for the other to release `S` before taking `X` $\rightarrow$ **INSTANT DEADLOCK**.
> By taking an **Update (U) Lock** during the read phase, only one transaction is allowed into the update pipeline, completely preventing conversion deadlocks!

---

## 3. Lock Escalation: The Threshold & Mitigation

### Why does Lock Escalation exist?
Locks are not free. Every lock in memory consumes **96 to 128 bytes** of database memory.
If a query locks 1,000,000 rows, the lock manager would consume ~120 MB of RAM just holding lock structs!
To conserve memory, the database engine enforces **Lock Escalation**:

* **The Threshold**: When a single Transact-SQL statement acquires **more than 5,000 locks** on a single table.
* **The Action**: The engine converts thousands of individual Row/Page locks into a **single Table-Level Exclusive (X) Lock**.
* **The Catastrophe**: A background job updating 6,000 rows suddenly locks the entire table, blocking all customer checkouts and crashing the application!

### Architectural Solutions to Lock Escalation:

#### 1. Batch Mutations in Chunks (< 2,500 rows)
```csharp
// The Principal Pattern for Bulk Updates / Deletes
public async Task<int> ExpireOldPromotionsInBatchesAsync()
{
    int totalUpdated = 0;
    int batchSize = 2500; // Well below the 5,000 threshold!

    while (true)
    {
        // Updates only 2500 rows per transaction
        int affected = await _db.Database.ExecuteSqlRawAsync(@"
            UPDATE TOP (@p0) Promotions
            SET Status = 'Expired'
            WHERE EndDate < GETUTCDATE() AND Status = 'Active';", 
            batchSize);

        totalUpdated += affected;
        if (affected < batchSize) break; // Finished all rows

        // Yield CPU briefly to let concurrent OLTP transactions breathe
        await Task.Delay(50);
    }

    return totalUpdated;
}
```

#### 2. Table-Level Lock Escalation Configuration (SQL Server)
```sql
-- Changes escalation to partition level (if partitioned) or disables it
ALTER TABLE Promotions SET (LOCK_ESCALATION = AUTO);
-- OR:
ALTER TABLE Promotions SET (LOCK_ESCALATION = DISABLE);
```

---

## 4. Deadlocks: Anatomy & Deterministic Resolution

A **Deadlock** is a circular dependency where two or more transactions permanently block each other because each holds a lock the other requires:

```text
Transaction A: Holds Lock on Order 101, Requests Lock on Order 102.
Transaction B: Holds Lock on Order 102, Requests Lock on Order 101.
```

Neither can proceed. The database **Deadlock Monitor** thread wakes up, traverses the wait graph, detects the cycle, and **kills one transaction (The Deadlock Victim)**, rolling it back with error `1205`:

```text
System.Data.SqlClient.SqlException (0x80131904): 
Transaction (Process ID 84) was deadlocked on lock resources with another process 
and has been chosen as the deadlock victim. Rerun the transaction.
```

---

### The Golden Rule: Deterministic Resource Ordering

How do you eliminate 99% of deadlocks in multi-resource mutations?
**Always acquire locks in the exact same sorted order across the entire application.**

Suppose a customer checks out a cart containing Item 45 and Item 12:

```csharp
// DEADLOCK-PRONE (Unordered):
// Thread 1 checks out [45, 12] -> Locks 45, then waits for 12.
// Thread 2 checks out [12, 45] -> Locks 12, then waits for 45. -> DEADLOCK!

// PRINCIPAL IMPLEMENTATION (Deterministically Sorted):
public async Task ReserveInventoryAsync(List<CartItem> items)
{
    // Sort deterministically by Primary Key BEFORE locking!
    var sortedItems = items.OrderBy(i => i.ProductId).ToList();

    using var tx = await _dbContext.Database.BeginTransactionAsync();

    foreach (var item in sortedItems)
    {
        // Thread 1 and Thread 2 will BOTH attempt to lock 12 first, then 45!
        // Cyclic wait is mathematically IMPOSSIBLE.
        await _dbContext.Database.ExecuteSqlRawAsync(
            "SELECT Stock FROM Inventory WITH (UPDLOCK, ROWLOCK) WHERE ProductId = {0}", 
            item.ProductId);

        // Deduct inventory...
    }

    await tx.CommitAsync();
}
```
