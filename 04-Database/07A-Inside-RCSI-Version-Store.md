# Inside the Version Store — MVCC, RCSI & TempDB Internals

> **Runtime Deep Dive**: Multi-Version Concurrency Control Mechanics  
> How databases achieve non-blocking reads, and the hidden operational costs of version stores.

---

## 1. The Core Philosophy of MVCC

Under traditional pessimistic locking:
- If a writer holds an **Exclusive (X) Lock** to modify a row, all readers must wait.
- If a reader holds a **Shared (S) Lock** to inspect a row, all writers must wait.

**Multi-Version Concurrency Control (MVCC)** shatters this bottleneck:
Instead of overwriting rows in place and locking out readers, the engine preserves the **previous committed versions** of the row.
When a reader queries the table, it simply traverses backwards in time to read the version that was valid when the transaction started.

> **The Universal Invariant**:
> **Readers never acquire locks. Readers never block writers. Writers never block readers.**

---

## 2. SQL Server: The `tempdb` Version Store & The 14-Byte Overhead

When you enable `READ_COMMITTED_SNAPSHOT ON` or `ALLOW_SNAPSHOT_ISOLATION ON` in SQL Server:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATA PAGE IN USER DATABASE (.mdf)                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Data Row (Current State):                                               │
│ [CustomerId: 104, Balance: $500] ──► [14-BYTE VERSION POINTER]          │
└──────────────────────────────────────────────┬──────────────────────────┘
                                               │ Points to tempdb
                                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        VERSION STORE IN tempdb                          │
├─────────────────────────────────────────────────────────────────────────┤
│ Version Record 1: [XSN: 10482, Balance: $350] ──► Points to Older Vers  │
│                                               │                         │
│ Version Record 0: [XSN: 10214, Balance: $100] ──► NULL (Oldest)         │
└─────────────────────────────────────────────────────────────────────────┘
```

### The 14-Byte Physical Page Tax
* Enabling RCSI appends a **14-byte pointer** to every modified row:
  - **8 bytes**: Transaction Sequence Number (`XSN`).
  - **6 bytes**: Pointer to the previous row version in `tempdb` (`FileId:PageId:SlotNumber`).
* **The Performance Warning**:
  - If a page is already 100% full (0 bytes free space) when an `UPDATE` occurs, adding that 14-byte pointer can trigger an unexpected **50/50 page split**!

### The Ghost Transaction Nightmare: `tempdb` Bloat
* SQL Server has a background **Ghost Cleanup** thread that cleans up old version records from `tempdb`.
* **The Rule**: A version record can ONLY be deleted if its `XSN` is older than the **OLDEST ACTIVE TRANSACTION** across the entire database!
* **The Catastrophe**:
  - Suppose an analyst opens a transaction at 09:00 AM: `BEGIN TRAN; SELECT COUNT(*) ...` and forgets to run `COMMIT`.
  - The application updates 2,000,000 rows during the day.
  - The cleanup thread cannot delete ANY of the old versions because that 09:00 AM transaction is still open!
  - `tempdb` swells from 2 GB to **250 GB**, filling the disk and crashing the entire server instance!

---

## 3. PostgreSQL: In-Page Tuples & The VACUUM Engine

PostgreSQL implements MVCC differently: it does not use a separate `tempdb` version store.
Instead, row versions (called **Tuples**) are stored **directly inside the table heap itself**!

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL 8KB HEAP PAGE                           │
├────────────────────────────────────────────────────────────────────────┤
│ Tuple 1: [xmin: 501, xmax: 505 (DEAD)] [Id: 1, Balance: $100]          │
│ Tuple 2: [xmin: 505, xmax: 0   (LIVE)] [Id: 1, Balance: $300]          │
└────────────────────────────────────────────────────────────────────────┘
```

### The System Columns:
Every PostgreSQL row header contains:
* `xmin`: The transaction ID that **inserted** this row.
* `xmax`: The transaction ID that **deleted or updated** this row (0 if still alive).

### The In-Place Update Fallacy & Table Bloat:
In PostgreSQL, an `UPDATE` statement physically executes an `INSERT` of a new tuple and marks the old tuple with `xmax = current_tx`.
The old tuple is now a **Dead Tuple**.

### The Role of VACUUM:
* **Autovacuum**: A background daemon that scans table pages, identifies dead tuples whose `xmax` is older than all running transactions, and unlinks them so the space can be reused by future inserts.
* **HOT (Heap-Only Tuple) Optimization**:
  - If an update does not modify any indexed column and there is free space on the current page, PostgreSQL creates the new tuple on the same page and chains it without updating secondary indexes!
