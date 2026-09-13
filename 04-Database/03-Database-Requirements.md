# Database Requirements & Operational Constraints

> **Sprint 04 Technical Specification**  
> System: Nova Commerce Global Retail Platform  
> Target RDBMS: PostgreSQL 16+ / Microsoft SQL Server 2022

---

## 1. Enterprise Business Drivers

Nova Commerce is migrating from a single-region deployment to a globally resilient, multi-tenant e-commerce platform.

The operational database must support:
- **Active User Base**: 500,000 daily active shoppers.
- **Product Catalog**: 5,000,000 SKU items across 12,000 merchant categories.
- **Transaction Volume**: Peak flash-sale burst of **45,000 checkouts/minute** (~750 write TPS).
- **Read-to-Write Ratio**: 92% Reads (Catalog, Reviews, Cart) / 8% Writes (Orders, Ledger, Inventory).

---

## 2. Non-Functional Performance Requirements (SLAs)

| Metric | Target SLA | 95th Percentile (p95) | 99th Percentile (p99) | Critical Failure Gate |
|---|---|---|---|---|
| **Product Search / Details Read** | < 10 ms | < 25 ms | < 50 ms | > 150 ms |
| **Order Creation Transaction** | < 35 ms | < 80 ms | < 120 ms | > 250 ms |
| **Payment Ledger Insertion** | < 15 ms | < 30 ms | < 60 ms | > 100 ms |
| **Merchant Inventory Check** | < 5 ms | < 12 ms | < 20 ms | > 50 ms |
| **Nightly Archival Batch Job** | Zero lock impact | < 1% CPU impact on active OLTP | Zero blocked transactions | Any blocked checkout |

---

## 3. Operational & Architectural Constraints

### DB-REQ-01: Zero-Reader-Blocking Invariant
* **Requirement**: Read queries (Product catalog browsing, order history review, analytics reporting) must **never** acquire shared locks that block incoming update/insert transactions.
* **Mechanism**: The database engine must operate under **Multi-Version Concurrency Control (MVCC)** in PostgreSQL or **Read Committed Snapshot Isolation (RCSI)** in SQL Server.
* **Invariant**: Readers do not block writers; writers do not block readers.

### DB-REQ-02: Predictable Memory Grants & Zero Disk Sort Spills
* **Requirement**: No production query may request an unbounded memory grant or spill sort/hash operations into `tempdb` or disk.
* **Mechanism**: Every ordered query or group-by query on high-frequency tables must be supported by an **indexed sort order** (B-Tree navigation) or have an explicit query hint / bounded memory grant.

### DB-REQ-03: Strict Sizing & Guardrails for Connection Pools
* **Requirement**: Application instances must never exhaust database worker threads or trigger connection pool timeouts.
* **Mechanism**:
  - Connection pool size per pod capped at **100 connections** (`MaxPoolSize=100`).
  - Max connection wait timeout: **5 seconds** (`Timeout=5`).
  - Strict scope disposal via `using` statements and scoped DI registration.

### DB-REQ-04: Deadlock Elimination via Deterministic Ordering
* **Requirement**: Multi-resource transactions (e.g., reserving inventory across 5 items in a shopping cart) must acquire locks in a **globally deterministic order**.
* **Invariant**: Resources must always be updated in ascending Primary Key order (`ORDER BY ProductId ASC`). Cyclic wait graphs are forbidden.

### DB-REQ-05: Batch Size Limits on Mutation Statements
* **Requirement**: Bulk data updates or deletions must never trigger **Lock Escalation** (which converts row/page locks into table-level exclusive locks).
* **Threshold**: Maximum mutation batch size: **2,500 rows per transaction chunk**.
* **Implementation**: Background archival and cleanup jobs must iterate in small loops with deliberate throttle pauses.

### DB-REQ-06: Strict Query Sargability & Anti-Scan Verification
* **Requirement**: Queries on tables exceeding 100,000 rows must never perform Clustered Index Scans or Full Table Scans for single-entity or range lookups.
* **Invariant**: All predicates in `WHERE` clauses must be **Sargable** (Search Argument Able). Wrapping indexed columns in functions (e.g., `WHERE YEAR(CreatedAt) = 2026`) is strictly prohibited.

### DB-REQ-07: Partitioning and Sliding Window Archival
* **Requirement**: Financial transaction logs and audit history exceeding 90 days must be automatically archived without taking table locks or causing log transaction bloat.
* **Mechanism**: Range partitioning on `CreatedAt` with partition metadata switching (`ALTER TABLE ... SWITCH PARTITION`).
