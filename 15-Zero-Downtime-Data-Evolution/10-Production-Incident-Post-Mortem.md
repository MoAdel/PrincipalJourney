# 10 — Post-Mortem: The `NOT NULL DEFAULT` Column Rewrite on PostgreSQL 10 vs. 16 & Foreign Key Lock Trap

> **Incident ID**: `INC-2026-1501` | **Severity**: `SEV-1` | **Duration**: `22 minutes`

---

## 1. Executive Summary & Fermi Derivation

A team added a new `merchant_id UUID REFERENCES merchants(id)` foreign key constraint to the `85,000,000`-row `ledger_entries` table using a single `ALTER TABLE ledger_entries ADD CONSTRAINT fk_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id);` statement without the `NOT VALID` clause.

> 📐 **Derive It (Fermi Mode): Full-Table Validation Scan Duration under `SHARE ROW EXCLUSIVE`**
> - **Inputs**: `TableRows = 85000000`, `RowBytes = 240`, `DiskReadThroughputMBps = 450`
> - **Formula**: `ValidationScanSec = ((TableRows * RowBytes) / (1024 * 1024)) / DiskReadThroughputMBps`
> - **Step-by-Step**:
>   1. Total table size scanned to validate all existing 85M rows against `merchants`: $85,000,000 \times 240\text{ B} \approx 19,455\text{ MB}$ ($19.45\text{ GB}$).
>   2. Sequential scan duration at $450\text{ MB/s}$: $\frac{19,455\text{ MB}}{450\text{ MB/s}} = 43.2\text{ seconds}$ (plus random index lookups into `merchants`, stretching actual runtime to $22\text{ minutes}$!).
>   3. During those 22 minutes, `ADD CONSTRAINT ... FOREIGN KEY` (without `NOT VALID`) held a `SHARE ROW EXCLUSIVE` lock on **both** `ledger_entries` and `merchants`, blocking 100% of `INSERT`/`UPDATE`/`DELETE` operations across both tables!
> - **What-If Sensitivity**: Splitting the DDL into two steps — `ALTER TABLE ledger_entries ADD CONSTRAINT fk_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) NOT VALID;` (`< 5ms` metadata-only) followed by `ALTER TABLE ledger_entries VALIDATE CONSTRAINT fk_merchant;` (acquires only `SHARE UPDATE EXCLUSIVE`, which **allows concurrent reads and writes**!) reduces write downtime from `22 minutes` to `0 milliseconds`!

---

## 2. Prevention & Validation Matrix

| Operation | Unsafe Blocking DDL | Principal Zero-Downtime Replacement | Validation & Rollback |
|---|---|---|---|
| **Add Foreign Key (Postgres)** | `ADD CONSTRAINT fk FOREIGN KEY ...` | `ADD CONSTRAINT fk FOREIGN KEY ... NOT VALID;` then `VALIDATE CONSTRAINT fk;` | Verify via `pg_locks` in staging that only `ShareUpdateExclusiveLock` is held during validation. |
| **Add Check Constraint (SQL Server)** | `WITH CHECK ADD CONSTRAINT ...` | `WITH NOCHECK ADD CONSTRAINT ...` then chunked verify | Drop constraint in `< 5ms` if rollback required. |
| **Create Index** | `CREATE INDEX ...` | `CREATE INDEX CONCURRENTLY` (PG) / `WITH (ONLINE = ON, WAIT_AT_LOW_PRIORITY ...)` (SQL) | Drop invalid/partial index if aborted. |
