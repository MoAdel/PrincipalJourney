# Inside the Query Optimizer Internals — Statistics, Memo & Parameter Sniffing

> **Runtime Deep Dive**: Cost-Based Optimization Mechanics  
> How the database optimizer explores billions of query permutations in milliseconds.

---

## 1. The Cost-Based Optimizer & The Memo Structure

Evaluating every possible execution strategy for a 6-table join would involve millions of permutations, causing query compilation to take minutes.
Modern optimizers (SQL Server's **Cascades-based engine** and PostgreSQL's **Genetic Query Optimizer - GEQO**) use **Search Space Pruning with The Memo Structure**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          THE MEMO STRUCTURE                            │
├────────────────────────────────────────────────────────────────────────┤
│ Group 1: Output Rows                                                   │
│   ├─ Expression 1: Filter on Group 2                                   │
│   └─ Expression 2: Top on Group 3                                      │
├────────────────────────────────────────────────────────────────────────┤
│ Group 2: Join (Orders, Customers)                                      │
│   ├─ Nested Loops Join (Group 4, Group 5)   Cost: 4.82                 │
│   ├─ Hash Match Join (Group 4, Group 5)     Cost: 1.12 [CHOSEN]        │
│   └─ Merge Join (Group 4, Group 5)          Cost: 2.45                 │
├────────────────────────────────────────────────────────────────────────┤
│ Group 4: Orders Table Access                                           │
│   ├─ Clustered Index Scan                   Cost: 8.90                 │
│   └─ Non-Clustered Index Seek + Lookup      Cost: 0.35 [CHOSEN]        │
└────────────────────────────────────────────────────────────────────────┘
```

### Transformation Rules & Stages
Optimization proceeds through phased exploration:
1. **Simplification**: Trivial plan detection, contradiction detection (e.g., `WHERE 1 = 0` returns empty set immediately).
2. **Search Stage 0 (Transaction Optimization)**: Quick search for simple OLTP queries. If cost is below threshold, stop immediately!
3. **Search Stage 1 (Quick Plan)**: Evaluates common join orders and index paths.
4. **Search Stage 2 (Full Optimization)**: Parallel plans, hash/merge join transformations, index matching. If a plan is found that is "good enough" relative to compilation cost, the optimizer **halts search** (Time-out heuristic).

---

## 2. Statistics & Histograms: The Fuel of Cardinality Estimation

The optimizer does not execute queries to guess row counts; it reads **Statistics Objects**:

### Anatomical Structure of Statistics
1. **Header**: Date updated, total rows in table, rows sampled, unmodified counter.
2. **Density Vector**: Reciprocal of distinct values ($\frac{1}{\text{Distinct Values}}$). Used when estimating unknown parameters or multiple equality predicates.
3. **Histogram (Up to 200 Steps)**:
   - Divides column values into up to 200 buckets.
   - `RANGE_HI_KEY`: The upper boundary value of the step.
   - `EQ_ROWS`: Estimated rows matching exactly `RANGE_HI_KEY`.
   - `RANGE_ROWS`: Rows falling strictly between previous step and this step.
   - `DISTINCT_RANGE_ROWS`: Number of unique values in the range.

```text
Step 1: RANGE_HI_KEY = '2026-01-01', EQ_ROWS = 450, RANGE_ROWS = 0
Step 2: RANGE_HI_KEY = '2026-02-01', EQ_ROWS = 620, RANGE_ROWS = 8400, DISTINCT = 30
...
Step 200: RANGE_HI_KEY = '2026-12-31', EQ_ROWS = 1200, RANGE_ROWS = 14200, DISTINCT = 28
```

### Stale Statistics & The Ascending Key Problem
* In an e-commerce database, `CreatedAt` or auto-incrementing `Id` grows monotonically every second.
* If statistics were updated yesterday when `Max(Id) = 1,000,000`, a query today asking for `WHERE Id > 1,000,000` falls **outside the histogram**!
* The optimizer estimates **1 row**!
* It grants the query minimal memory (64 KB) and chooses a Nested Loops join.
* When the query actually returns 150,000 rows, it triggers **massive TempDB sort spills and CPU starvation**!

---

## 3. Parameter Sniffing: The Enterprise Double-Edged Sword

### What is Parameter Sniffing?
When a parameterized query or stored procedure executes for the **first time**:
1. The engine "sniffs" the exact runtime value of the parameter passed in.
2. It consults the histogram for *that specific value*.
3. It generates and caches an execution plan optimized for *that specific value*.
4. **Subsequent executions reuse that cached plan regardless of the parameters passed!**

### The Catastrophic Scenario

```sql
CREATE PROCEDURE GetOrdersByStatus @Status VARCHAR(20)
AS
BEGIN
    SELECT * FROM Orders WHERE Status = @Status;
END
```

* **Data Distribution**:
  - `Status = 'Pending'`: 50 rows (0.01% of table).
  - `Status = 'Completed'`: 2,000,000 rows (99% of table).

* **Case 1**: Query executed first with `@Status = 'Pending'`:
  - Optimizer sniffs `'Pending'`, generates an **Index Seek + Key Lookup** plan.
  - Plan is saved in the Plan Cache.
  - 10 minutes later, someone calls `GetOrdersByStatus('Completed')`.
  - The engine uses the cached plan! It attempts to execute **2,000,000 individual Key Lookups** across the clustered index, crashing the storage subsystem!

* **Case 2**: Query executed first with `@Status = 'Completed'`:
  - Optimizer sniffs `'Completed'`, generates a **Clustered Index Scan** plan.
  - Next, someone queries `'Pending'`.
  - The engine scans 2,000,000 rows to return 50 rows!

---

## 4. Architectural Mitigations for Parameter Sniffing

| Strategy | SQL Syntax | Trade-off |
|---|---|---|
| **Optimize for Average / Unknown** | `OPTION (OPTIMIZE FOR UNKNOWN)` | Uses the Density Vector instead of specific histogram step. Safe, predictable, but sub-optimal for extreme edge cases. |
| **Optimize for Specific Constant** | `OPTION (OPTIMIZE FOR (@Status = 'Pending'))` | Ideal when 99% of your traffic targets a specific high-frequency value. |
| **Query Recompile** | `OPTION (RECOMPILE)` | Generates a fresh plan on every execution. Zero parameter sniffing, but burns CPU compiling plans (unsuitable for 10k RPS). |
| **Branching Procedures** | Separate procedures for high/low selectivity | The **Principal pattern**: Separate the read paths into distinct queries based on data volume. |
