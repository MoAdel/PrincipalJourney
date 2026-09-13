# Learning Objectives — Database Performance & Relational Internals

> **Sprint 04 Competency Matrix**  
> Target Level: Senior Software Engineer → Principal Data Architect

---

## The 5-Level Mastery Model

In the Principal Engineer Academy, true mastery requires progressing through five distinct levels:

```text
Level 1: Understand  ──►  Why does the abstraction exist?
Level 2: Implement   ──►  Can you build it and tune it in code?
Level 3: Analyze     ──►  What is the physical runtime/engine behavior?
Level 4: Optimize    ──►  How do you eliminate hot paths, locks & memory grants?
Level 5: Principal   ──►  Can you define enterprise standards and defend trade-offs?
```

---

## 🎯 Competency Matrix

| Domain | Level 1: Understand | Level 2: Implement | Level 3: Analyze (Internals) | Level 4: Optimize | Level 5: Principal Judgment |
|---|---|---|---|---|---|
| **Query Optimization** | Why cost-based optimizers generate execution plans | Query tuning using hints, indexes, and sargable predicates | Search space pruning (Memo), Cardinality Estimation, Parameter Sniffing | Eliminating Sort Spills in `tempdb`, Hash Match spills, and Table Spools | Designing workload-specific query patterns (OLTP vs OLAP) |
| **B-Tree Physical Indexing** | Clustered vs Non-Clustered vs Covering indexes | Creating composite indexes with `INCLUDE` clauses and partial filters | 8KB database pages, slot arrays, page splits, and B-Tree root/leaf levels | Eliminating Key Lookups, reducing IOPS read amplification, tuning Fill Factor | Primary key strategies: Monotonic BIGINT vs UUIDv7 vs random GUIDs |
| **Transactions & Isolation** | ACID guarantees and concurrency anomalies (Dirty, Phantom reads) | Explicit transactions with EF Core and Dapper using `IsolationLevel` | MVCC row versioning, SQL Server RCSI version store in `tempdb`, Postgres VACUUM | Resolving write skew anomalies without full Serializable table locks | Balancing strict consistency vs throughput in financial ledgers |
| **Locking & Deadlocks** | Lock modes (S, X, IS, IX, U) and compatibility matrix | Deadlock-free transactions using deterministic ordering & `UPDLOCK` | Lock escalation thresholds (5k row locks $\rightarrow$ table lock), Lock Manager hashes | Eliminating blocking chains with intent locks and short transaction lifecycles | Architectural policies for batch updates, background jobs, and purging |
| **Connection Pooling** | Why connection pooling exists and how drivers manage it | Configuring min/max pool sizes, timeouts, and connection lifecycles | TCP socket states (`ESTABLISHED`, `TIME_WAIT`), driver starvation queues | Diagnosing and eliminating connection leaks, long-lived uncommitted transactions | Capacity planning: sizing connection pools against database thread capacity |
| **ORM & Data Access** | Trade-offs between full ORMs (EF Core) and Micro-ORMs (Dapper) | Advanced EF Core: Compiled Models, Split Queries, Interceptors, Batching | Entity tracking graph overhead, reflection overhead, SQL translation pipelines | CQRS read/write split: EF Core for domain mutations, Dapper for read models | Architectural standards for enterprise data access boundaries |
| **Partitioning & Archival** | Horizontal table partitioning vs sharding | Range partitioning with sliding window pattern in SQL / PostgreSQL | Partition pruning in execution plans, metadata partition switching | Zero-downtime partition truncation and historical data archival | Cold storage offloading vs operational database capacity planning |

---

## 🏆 Definition of Done for Sprint 04

You have successfully mastered Sprint 04 when you can:

1. **Read Execution Plans Blindfolded**:
   - Given an XML or graphical execution plan, instantly identify the top bottleneck (Index Scan, Key Lookup, Hash Match, Sort Spill, Cardinality Mismatch).
2. **Design Optimal B-Tree Indexes**:
   - Design composite indexes that achieve a **100% Index Seek** with zero Key Lookups for multi-predicate queries.
3. **Eliminate Concurrency Bottlenecks**:
   - Safely configure and defend **Read Committed Snapshot Isolation (RCSI)** or PostgreSQL **MVCC**, explaining exactly how the version store works in memory and disk.
4. **Prevent and Resolve Deadlocks**:
   - Analyze a raw deadlock graph XML file, trace the participating SPIDs, identify the resource contention, and refactor the code to eliminate the deadlock deterministically.
5. **Tune High-Concurrency Client Drivers**:
   - Prevent connection pool exhaustion under 20,000+ concurrent requests by sizing connection pools and eliminating connection capture anti-patterns.
6. **Deploy Advanced EF Core 9 & Dapper Architectures**:
   - Implement **Compiled Models** (`dotnet ef dbcontext optimize`), configure **Split Queries** to eliminate Cartesian explosions, and build high-throughput CQRS read pipelines with Dapper.
7. **Defend Technical Decisions**:
   - Confidently answer the **Principal Architectural Defense Questions** against DBAs, infrastructure leads, and CTOs without relying on dogmatic rules.
