# Summary — The 10 Invariant Laws of Principal Database Performance

> **Executive Synthesis & Mental Models**  
> Core architectural axioms to internalize for lifelong systems design.

---

## 🏛️ The 10 Invariant Laws

### Law 1: The Physical Reality Invariant
A database is not a mathematical set; it is a physical memory cache managing 8KB pages backed by an append-only transaction log. Every abstraction (LINQ, ORM, Views) eventually translates to page allocations, slot array lookups, and disk seeks.

### Law 2: The Reader-Writer Isolation Invariant
Never permit readers to block writers or writers to block readers in an enterprise OLTP system. Enforce Multi-Version Concurrency Control (PostgreSQL MVCC) or Read Committed Snapshot Isolation (SQL Server RCSI) as the baseline.

### Law 3: The Clustered Key Monotonicity Law
Clustered index keys must be strictly monotonic, narrow, unique, and static (`BIGINT IDENTITY` or .NET 9 `UUIDv7`). Random GUID clustered keys are an architectural crime that triggers continuous 50/50 page splits and destroys Buffer Pool cache efficiency.

### Law 4: The Covering Index Invariant
High-frequency queries must achieve an **Index Seek with 0 Key Lookups**. Use the `INCLUDE` clause to append projection columns to leaf pages without fattening the intermediate B-Tree branch structure.

### Law 5: The Sargability Law
Never wrap indexed columns in scalar functions or rely on implicit data type conversions (`CONVERT_IMPLICIT`). If the predicate is not sargable, the optimizer is physically blind to the B-Tree and will scan the entire table.

### Law 6: The Connection Sizing Paradox
Increasing connection pool size under load makes the database slower, not faster. The optimal connection count is proportional to the database's physical CPU cores ($2 \times \text{Cores} + \text{Disk Spindles}$). Eliminate slow queries; do not multiply idle connections.

### Law 7: The Lock Escalation Threshold
Never update or delete more than 2,500 rows in a single Transact-SQL statement. Crossing the 5,000-lock threshold triggers lock escalation to a Table-Level Exclusive Lock, halting concurrent operations.

### Law 8: The Deterministic Deadlock Prevention Law
Deadlocks are prevented by discipline, not luck. All multi-resource transactions must acquire locks in the exact same sorted primary key order across the entire codebase.

### Law 9: The CQRS Data Access Dichotomy
Do not force a single ORM to handle both domain business mutations and high-speed reporting reads. Use EF Core 9 for command invariants and unit-of-work tracking; use Dapper / raw ADO.NET for high-throughput read projections.

### Law 10: The Partitioning & Archival Lifeline
Tables growing beyond 50 million rows must implement horizontal range partitioning with sliding-window metadata switching. Deleting millions of rows with `DELETE` locks the table and bloats the log; dropping a partition via `SWITCH` is instantaneous and zero-log.
