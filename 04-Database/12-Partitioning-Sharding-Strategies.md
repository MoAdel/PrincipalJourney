# Table Partitioning & Sharding Strategies — Scaling Beyond Single Tables

> **Core Concept**: Horizontal Data Segmentation  
> How to maintain sub-millisecond query performance on tables with 100+ million rows using Partition Pruning and Sliding Windows.

---

## 1. When Does a Single Table Hit the Scaling Wall?

When an operational table grows beyond **50 million to 100 million rows**:
1. **Maintenance Overhead**: Index rebuilds and statistics updates take hours and exhaust transaction logs.
2. **Buffer Pool Thrashing**: Scans on historical records evict active, hot operational data from RAM.
3. **Lock Escalation Risk**: Bulk deletes of expired records lock the entire active table.
4. **Backup/Restore Limits**: Restoring a 10TB monolithic database during an emergency can take 12 hours.

---

## 2. Horizontal Table Partitioning & Partition Pruning

Partitioning physically divides a single logical table into multiple smaller physical tables (partitions) while maintaining a **single unified table abstraction** for application queries.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LOGICAL TABLE: dbo.Orders                             │
│                  Partition Key: CreatedAt (Range Monthly)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐ │
│  │ Partition 1: Jan 2026│  │ Partition 2: Feb 2026│  │ Partition 3: Mar 26│ │
│  │ Physical Filegroup A │  │ Physical Filegroup B │  │ Physical Filegrp C │ │
│  │ [Rows: 1.2 Million]  │  │ [Rows: 1.4 Million]  │  │ [Rows: 1.8 Million]│ │
│  └──────────────────────┘  └──────────────────────┘  └────────────────────┘ │
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │
                    Query: WHERE CreatedAt >= '2026-02-01'
                           AND CreatedAt < '2026-03-01'
                                       │
                      PARTITION PRUNING: Only Partition 2
                      is accessed! Partitions 1 & 3 are SKIPPED!
```

### Partition Pruning in Execution Plans
When a query contains the partition key in its `WHERE` clause:
The optimizer reads partition metadata and eliminates non-matching partitions **at compile time**.
The execution plan indicates:
```text
Actual Partition Count: 1
Partitions Accessed: 2
```
A query scanning a 100-million-row table only touches the 1.4 million rows of February, executing **50x to 100x faster**!

---

## 3. The Sliding Window Archival Pattern

How do you purge 10 million historical records older than 12 months without taking exclusive locks or generating millions of log records?

### The Traditional (Terrible) Approach:
```sql
-- CATASTROPHIC: Takes millions of row locks, escalates to table lock, blows up transaction log!
DELETE FROM Orders WHERE CreatedAt < '2025-01-01';
```

### The Principal Approach: Partition Metadata Switching
Instead of physically deleting rows, we use **Metadata Partition Switching**:
1. Create an empty staging table with identical schema: `Orders_Archive_Jan2025`.
2. Execute a metadata pointer swap:
```sql
-- Instantaneous pointer switch (Takes ~0.005 seconds!)
ALTER TABLE Orders SWITCH PARTITION 1 TO Orders_Archive_Jan2025;
```
3. The oldest partition is instantly detached from `Orders`.
4. Drop or truncate the staging table:
```sql
TRUNCATE TABLE Orders_Archive_Jan2025; -- Instant zero-log cleanup!
```

---

## 4. Partitioning vs. Sharding: The Architectural Boundary

| Dimension | Table Partitioning | Application Sharding |
|---|---|---|
| **Topology** | Single database instance; multiple physical files | Multiple independent database servers/clusters |
| **Cross-Entity Queries** | Native SQL joins supported across partitions | **Cross-shard joins are impossible** without two-phase commit |
| **Transactions** | Full ACID guarantees across all partitions | Requires distributed transaction coordination (Sagas) |
| **Complexity** | Managed natively by database engine (Transparent) | Managed by application routing layer or middleware |
| **When to Use** | Up to **5 TB – 10 TB** data volumes | When write IOPS exceed the hardware limits of any single machine |
