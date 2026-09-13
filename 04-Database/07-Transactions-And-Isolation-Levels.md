# Transactions & Isolation Levels — Concurrency Anomalies & Trade-offs

> **Core Concept**: Transaction Isolation Levels & Data Integrity  
> Balancing transactional consistency against multi-thousand RPS concurrency.

---

## 1. The ANSI SQL-92 Isolation Matrix & Anomalies

Transaction isolation defines the degree to which the operations of one transaction are hidden from concurrent transactions.
The ANSI SQL standard defines four classic isolation levels based on three phenomena:

```text
┌────────────────────┬─────────────┬────────────────────────┬──────────────┐
│  Isolation Level   │ Dirty Read  │  Non-Repeatable Read   │ Phantom Read │
├────────────────────┼─────────────┼────────────────────────┼──────────────┤
│ Read Uncommitted   │   YES ⚠️    │         YES ⚠️         │    YES ⚠️    │
│ Read Committed     │    NO       │         YES ⚠️         │    YES ⚠️    │
│ Repeatable Read    │    NO       │          NO            │    YES ⚠️    │
│ Serializable       │    NO       │          NO            │     NO       │
└────────────────────┴─────────────┴────────────────────────┴──────────────┘
```

---

## 2. Dissecting the Concurrency Anomalies

### 1. The Dirty Read (Read Uncommitted / `WITH (NOLOCK)`)
* **Scenario**:
  1. Transaction 1 updates Customer Balance from \$100 to \$500, but has **not yet committed**.
  2. Transaction 2 reads Balance as \$500 and approves a withdrawal.
  3. Transaction 1 encounters an error and **rolls back** (Balance returns to \$100).
* **The Result**: Transaction 2 acted on a phantom state that never officially existed!
* **The Dangerous `NOLOCK` Myth**:
  - Developers use `WITH (NOLOCK)` thinking it is a free performance hack.
  - In reality, `NOLOCK` can read **pages in the middle of a 50/50 page split**, returning **duplicate rows** or **skipping rows entirely**!

---

### 2. The Non-Repeatable Read (Fuzzy Read)
* **Scenario**:
  1. Transaction 1 reads Product Inventory: `Stock = 10`.
  2. Transaction 2 executes `UPDATE Inventory SET Stock = 0 WHERE ProductId = 1` and **commits**.
  3. Transaction 1 re-reads Inventory within the same transaction: `Stock = 0`!
* **Why it happens in Read Committed**: Under traditional locking, Read Committed acquires a **Shared (S) Lock** on the row, reads it, and **releases the lock immediately** before the transaction ends.
* **The Fix**: Under `REPEATABLE READ`, Shared locks are **held until the very end of the transaction (`COMMIT` or `ROLLBACK`)**.

---

### 3. The Phantom Read
* **Scenario**:
  1. Transaction 1 counts VIP customers: `SELECT COUNT(*) FROM Customers WHERE Tier = 'VIP'` (Returns 10).
  2. Transaction 2 inserts a new VIP customer: `INSERT INTO Customers (Tier) VALUES ('VIP')` and **commits**.
  3. Transaction 1 runs the query again: Returns 11!
* **Why it happens in Repeatable Read**: Repeatable Read locks the *existing rows* that were read, but does **not prevent new rows** from being inserted into the empty space between keys!
* **The Fix**: `SERIALIZABLE` isolation uses **Key-Range Locks (`RangeS-S`)**, locking the gap between keys to physically prevent insertions into the range.

---

### 4. The 4th Anomaly: Write Skew (Snapshot Isolation Trap)
Neither Dirty, Non-Repeatable, nor Phantom reads occur under **Snapshot Isolation**. Yet, a dangerous anomaly exists: **Write Skew**.

```text
Constraint Invariant: An on-call medical shift must have at least ONE doctor active.
Doctors Active: Alice (Active), Bob (Active)

Time  Transaction 1 (Alice)                  Transaction 2 (Bob)
────  ─────────────────────                  ───────────────────
T1    Reads active doctors: 2                Reads active doctors: 2
T2    Update Alice -> Inactive               Update Bob -> Inactive
T3    Check invariant: 2 - 1 = 1 >= 1 (OK)   Check invariant: 2 - 1 = 1 >= 1 (OK)
T4    COMMIT                                 COMMIT

Result: 0 DOCTORS ON CALL! Invariant Violated!
```

* **Why it occurred**: Each transaction modified a *different row* based on a snapshot of overlapping data. Because there was no direct write-write row collision, Snapshot Isolation allowed both to commit!
* **The Architectural Fix**:
  1. Full `SERIALIZABLE` isolation.
  2. Or explicit pessimistic intent lock: `SELECT ... FOR UPDATE` (PostgreSQL) or `WITH (UPDLOCK, HOLDLOCK)` (SQL Server).

---

## 3. Snapshot Isolation vs. Read Committed Snapshot (RCSI)

| Feature | Read Committed Snapshot (RCSI) | Snapshot Isolation (SI) |
|---|---|---|
| **Activation Scope** | Database-wide default (`SET READ_COMMITTED_SNAPSHOT ON`) | Session / Transaction level (`SET TRANSACTION ISOLATION LEVEL SNAPSHOT`) |
| **Read Consistency** | Statement-Level (Each query sees data committed as of statement start) | Transaction-Level (All queries see data committed as of transaction start) |
| **Write Collisions** | Writers wait on locks (Standard locking) | First committer wins; second transaction throws update conflict exception |
| **Application Changes** | **Zero code changes required!** (Drop-in replacement) | Requires handling retry logic on update conflict exceptions |
| **Impact on Deadlocks** | **Eliminates ~90% of all read-write deadlocks!** | Eliminates read-write deadlocks; increases conflict retries |
