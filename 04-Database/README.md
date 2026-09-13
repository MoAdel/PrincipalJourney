# Challenge 04 — Database Performance & Relational Internals

> **Sprint 04**
>
> Estimated Duration: **7 Days**
>
> Estimated Effort: **24–30 Hours**
>
> Difficulty: ⭐⭐⭐⭐⭐
>
> Target Level:
>
> Senior Software Engineer → Principal Data Architect & Systems Performance Engineer

---

# Challenge Overview

Welcome to Sprint 04 of the Principal Engineer Academy.

In early-stage systems or small workloads, relational databases are forgiving. An unindexed foreign key or an inefficient `SELECT *` might take 5 milliseconds instead of 1 millisecond. Nobody notices.

At enterprise scale, when a platform grows to millions of users, hundreds of thousands of concurrent transactions, and multi-terabyte datasets, the database transforms into the single greatest point of architectural vulnerability:
- A single missing covering index forces a 20-million-row clustered index scan, saturating storage IOPS and evicting warm pages from the Buffer Pool.
- Inappropriate transaction isolation levels trigger lock escalation, causing thread pool starvation and catastrophic deadlocks across checkout pipelines.
- An innocent LINQ query with nested `.Include()` statements generates a Cartesian explosion that transfers gigabytes of redundant data over TDS/Postgres wire protocols and pegs application CPU in JSON serialization.
- Exhausted connection pools freeze healthy application servers while the database engine sits waiting on blocked transactions.

A Senior Engineer writes LINQ queries and hopes EF Core figures it out.  
A **Principal Software Engineer understands the physical reality of the database engine**: page structures, B-Tree splitting, cardinality estimation, query optimizer search spaces, memory grants, MVCC version stores, and locking protocols.

---

# Business Context & Mission

**Nova Commerce** is experiencing rapid global growth:
1. **High-Frequency Flash Sales**: 45,000 orders/minute arriving during promotional campaigns across distributed regional pods.
2. **Real-Time Inventory Ledger**: Multi-item order reservations requiring strict consistency without locking the entire product catalog.
3. **Deep Product Catalog Search**: Filtering 5 million active SKUs across dozens of dynamic attributes, pricing tiers, and merchant ratings.
4. **Financial Reconciliation & Auditing**: Archiving 50 million historical financial ledger rows while maintaining sub-10ms query performance for active operational queries.

### Your Mission:
Design, implement, and tune a high-performance relational database architecture across **SQL Server** and **PostgreSQL** that:
- Diagnoses and eliminates suboptimal execution plans (Sort Spills, Table Spools, Key Lookups, Hash Joins).
- Implements optimal B-Tree indexing strategies (Clustered, Non-Clustered, Covering `INCLUDE` indexes, Filtered indexes).
- Masters physical page layout, eliminating page splits and minimizing read amplification.
- Eliminates locking bottlenecks using **Multi-Version Concurrency Control (MVCC)** and **Read Committed Snapshot Isolation (RCSI)**.
- Prevents deadlocks through deterministic transaction ordering and intentional locking primitives (`UPDLOCK`, `ROWLOCK`).
- Tunes client driver connection pooling (ADO.NET / Npgsql), preventing thread starvation and connection pool exhaustion.
- Leverages high-performance **EF Core 9** features (Compiled Models, Split Queries, Interceptors, Batching) and CQRS **Dapper** micro-ORM projections.
- Applies table partitioning (sliding window pattern) to archive cold data without locking active tables.

---

# Structure of Sprint 04 Modules

```
04-Database/
├── README.md                                # Sprint Overview, Mission & Matrix
├── 01-Story.md                              # The Production Crisis: The Lock Escalation Meltdown
├── 02-Learning-Objectives.md                # 5-Level Competency Matrix
├── 03-Database-Requirements.md              # Non-Functional Database Specifications & SLAs
├── 04-Database-Architecture.md              # Relational Engine Anatomy: Optimizer, Buffer & WAL
├── 05-Execution-Plans-Internals.md          # Execution Plans, Cardinality, Seek vs Scan & Spills
├── 05A-Inside-Query-Optimizer-Internals.md  # Deep Dive: Cost-Based Optimizer & Parameter Sniffing
├── 06-BTree-Indexing-Strategies.md          # B-Tree Indexes: Clustered, Covering & Filtered
├── 06A-Inside-BTree-Page-Internals.md       # Deep Dive: 8KB Pages, Slot Arrays & Page Splits
├── 07-Transactions-And-Isolation-Levels.md  # Isolation Levels: Dirty, Non-Repeatable & Phantom Reads
├── 07A-Inside-RCSI-Version-Store.md         # Deep Dive: MVCC, RCSI & TempDB / Vacuum Mechanics
├── 08-Locking-Deadlocks-Escalation.md       # Lock Modes, Escalation Triggers & Deadlock Resolution
├── 09-Connection-Pooling-Starvation.md      # Connection Pooling, Leaks & Driver Tuning
├── 10-EFCore-Advanced-Performance.md        # EF Core 9: Compiled Models, Split Queries & Interceptors
├── 11-Dapper-MicroORM-Optimization.md       # CQRS Read Models, Dapper Projections & Bulk Ingestion
├── 12-Partitioning-Sharding-Strategies.md   # Range Partitioning, Sliding Windows & Sharding
├── 13-Database-Security-Audit-Checklist.md  # Production Go/No-Go Security & Performance Gate
├── 14-Hands-On-Database-Labs.md             # 6 Practical Hands-On Performance Labs
├── 15-Database-Incident.md                  # SEV-1 Post-Mortem: The Black Friday Lock Avalanche
├── 16-Principal-Defense-Questions.md        # Architectural Defense Scenarios against DBAs & Staff
├── 17-Interview-Scenarios.md                # Principal System Design Interview Scenarios
├── 18-Summary.md                            # Executive Synthesis & Architectural Heuristics
└── 19-Resources.md                          # Curated Authoritative Database Literature & RFCs
```

---

# The 7-Day Study & Implementation Plan

| Day | Modules | Focus & Deliverables |
|---|---|---|
| **Day 1** | Modules 01–04 | Story, Requirements, Competency Matrix & Relational Engine Architecture |
| **Day 2** | Modules 05, 05A | Query Execution Plans, Cost-Based Optimizer, Cardinality & TempDB Sort Spills |
| **Day 3** | Modules 06, 06A | B-Tree Indexes, Clustered Keys, 8KB Pages, Fill Factor & Page Split Prevention |
| **Day 4** | Modules 07, 07A, 08 | Concurrency, Isolation Levels, RCSI/MVCC Version Store, Deadlocks & Escalation |
| **Day 5** | Modules 09, 10, 11 | Connection Pool Tuning, EF Core 9 Optimization & Dapper High-Speed Projections |
| **Day 6** | Modules 12, 13, 14 | Table Partitioning, Production Security Audit & Hands-On Architecture Labs |
| **Day 7** | Modules 15–19 | SEV-1 Post-Mortem, Principal Architectural Defense, Interview Defense & Synthesis |
