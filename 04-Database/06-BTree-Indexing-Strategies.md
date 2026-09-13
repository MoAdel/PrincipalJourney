# B-Tree Indexing Strategies — Architecture & Selection Rules

> **Core Concept**: Physical Index Architecture  
> How to design B-Tree indexes that maximize search velocity, eliminate key lookups, and minimize write amplification.

---

## 1. Anatomy of the B-Tree Index

All standard indexes in SQL Server, PostgreSQL, and MySQL are **B+ Trees** (balanced trees where all leaf nodes reside at the exact same depth and contain doubly-linked horizontal pointers).

```text
                        ┌────────────────────────┐
                        │       ROOT PAGE        │
                        │ [Keys: 100, 500, 1000] │
                        └───────────┬────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  INTERMEDIATE PAGE  │  │  INTERMEDIATE PAGE  │  │  INTERMEDIATE PAGE  │
│ [Keys: 100, 250]    │  │ [Keys: 500, 750]    │  │ [Keys: 1000, 1500]  │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
  ┌────────┴────────┐      ┌────────┴────────┐      ┌────────┴────────┐
  ▼                 ▼      ▼                 ▼      ▼                 ▼
┌───────┐ ◄───► ┌───────┐┌───────┐ ◄───► ┌───────┐┌───────┐ ◄───► ┌───────┐
│ LEAF  │       │ LEAF  ││ LEAF  │       │ LEAF  ││ LEAF  │       │ LEAF  │
│ PAGE  │       │ PAGE  ││ PAGE  │       │ PAGE  ││ PAGE  │       │ PAGE  │
└───────┘       └───────┘└───────┘       └───────┘└───────┘       └───────┘
```

### The Traverse Mechanics:
1. Binary search through the **Root Page** (Memory hit).
2. Follow pointer to the corresponding **Intermediate Page**.
3. Follow pointer to the **Leaf Page**.
4. In a table with **100,000,000 rows**, a B-Tree depth is typically only **3 or 4 levels**. Any single row is reached in **4 page reads** ($O(\log N)$)!

---

## 2. Clustered vs. Non-Clustered Indexes

```text
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│            CLUSTERED INDEX                   │ │           NON-CLUSTERED INDEX                │
├──────────────────────────────────────────────┤ ├──────────────────────────────────────────────┤
│ • The table IS the index.                    │ │ • Separate, secondary B-Tree structure.      │
│ • Leaf nodes contain the ACTUAL DATA ROWS.   │ │ • Leaf nodes contain Index Keys + Pointer.   │
│ • Exactly ONE per table.                     │ │ • Pointer is the Clustered Key (or Heap RID).│
│ • Defines physical sort order of pages.      │ │ • Can have up to hundreds per table.         │
└──────────────────────────────────────────────┘ └──────────────────────────────────────────────┘
```

> **PostgreSQL Difference**:
> In PostgreSQL, tables are **Heaps** by default. Secondary indexes point to a `TID` (Tuple ID: `BlockNumber:Offset`). SQL Server tables can be Heaps or Clustered Indexes (almost always Clustered in production).

---

## 3. The 4 Golden Rules for Clustered Keys

The choice of your Clustered Key determines the performance of your **entire database**:
Because every single non-clustered index on the table stores the clustered key in its leaf pages as a pointer:

1. **Monotonic (Strictly Increasing)**:
   - Values must increment sequentially (`BIGINT IDENTITY`, `UUIDv7`).
   - Inserting random values (`Guid.NewGuid()`) forces insertions into random physical pages, causing continuous **50/50 Page Splits** and massive disk fragmentation!
2. **Narrow (Small Byte Size)**:
   - A `BIGINT` is 8 bytes; a random string key might be 64 bytes.
   - If a clustered key is 64 bytes, every secondary index wastes 56 extra bytes per row across millions of rows, blowing up Buffer Pool memory.
3. **Unique**:
   - If you cluster on a non-unique column, SQL Server secretly appends a 4-byte `uniquifier` to duplicate keys, wasting memory.
4. **Static (Immutable)**:
   - Updating a clustered key forces the row to be physically deleted and re-inserted across the B-Tree and updates every secondary index pointer.

---

## 4. Composite Index Column Ordering: The Equality-First Rule

When building an index on multiple columns, column order is everything:

$$\text{Index Order: } (\text{Column 1}, \text{Column 2}, \text{Column 3})$$

### The Rule of Thumb:
1. **Column 1**: Strict **Equality** filters (`WHERE TenantId = @id`)
2. **Column 2**: Secondary **Equality** filters (`AND Status = 'Active'`)
3. **Column 3**: **Range / Inequality** filters (`AND CreatedAt >= @start`)
4. **Column 4**: **Sorting** columns (`ORDER BY Id ASC`)

### Why Column Order Matters:
If you define `INDEX (CreatedAt, Status)` and query:
```sql
WHERE Status = 'Active' AND CreatedAt >= '2026-01-01'
```
The B-Tree is sorted primarily by `CreatedAt`. The engine cannot jump directly to `Status = 'Active'`—it must scan all leaf pages starting from `'2026-01-01'` and evaluate `Status` row-by-row!  
Flipping the index to `(Status, CreatedAt)` enables a razor-sharp **Index Seek** directly to the first `'Active'` row on `'2026-01-01'`.

---

## 5. Covering Indexes & The `INCLUDE` Clause

A **Covering Index** contains all columns required by a query, completely eliminating Key Lookups.

```sql
-- Query:
SELECT OrderId, CustomerId, Total, CreatedAt 
FROM Orders 
WHERE Status = 'Paid' AND CreatedAt >= '2026-08-01';
```

### The Naive Index:
```sql
CREATE NONCLUSTERED INDEX IX_Orders_Naive 
ON Orders (Status, CreatedAt, CustomerId, Total);
```
* **Problem**: Adding `CustomerId` and `Total` to the B-Tree index key makes the intermediate B-Tree branch pages fat, drastically reducing the number of keys per page and increasing B-Tree depth!

### The Principal Covering Index:
```sql
CREATE NONCLUSTERED INDEX IX_Orders_Covering 
ON Orders (Status, CreatedAt)
INCLUDE (CustomerId, Total);
```
* **The Mechanics**:
  - `Status` and `CreatedAt` form the B-Tree key navigation structure (kept slim and cacheable).
  - `CustomerId` and `Total` are stored **only at the leaf level**!
  - Query executes with a single **Index Seek** and **0 Key Lookups**, while keeping index size minimal.

---

## 6. Filtered (Partial) Indexes: 90% Space Savings

In many systems, 99% of data is cold or closed, while 1% is active:
- `Orders`: 99% are `Completed` or `Cancelled`. 1% are `Processing`.
- `Promotions`: 95% are `Expired`. 5% are `Active`.

```sql
-- Index ONLY active promotions!
CREATE NONCLUSTERED INDEX IX_Promotions_Active 
ON Promotions (Code)
INCLUDE (DiscountPercentage, ExpiryDate)
WHERE Status = 'Active'; -- PostgreSQL & SQL Server Partial Index
```

### Why this is a Masterstroke:
* The index is **95% smaller** than a full index.
* Inserting or updating 'Completed' orders **never touches this index**, eliminating write amplification.
* Fits 100% in the Buffer Pool memory.
