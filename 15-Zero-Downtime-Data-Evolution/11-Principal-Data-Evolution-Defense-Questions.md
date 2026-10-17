# 11 — Principal Zero-Downtime Data Evolution Defense Questions

---

### Question 1: Changing a Primary Key / Foreign Key from `INT` to `BIGINT` at 98% `INT.MaxValue`
> *"Our `Transactions` table has reached `2,090,000,000` rows — just 57 million rows away from overflowing signed 32-bit `INT` (`2,147,483,647`), which will brick the company in 9 days. `ALTER TABLE ALTER COLUMN Id BIGINT` will lock the 1.2TB table for 6 hours. How do you execute this with zero downtime?"*

**Principal Defense**:
1. **Immediate Bleeding Stop (Negative Identity Seed if emergency < 24h)**: If you have `< 24 hours` and the code uses signed `INT`, reseeding `DBCC CHECKIDENT ('Transactions', RESEED, -2147483648)` buys another 2.14 billion rows immediately while you execute the real Expand/Contract migration! (Verify no application validator checks `id > 0`).
2. **The Zero-Downtime Shadow-Column / Shadow-Table Expand & Contract**:
   - **Step 1 (Expand)**: Add `IdBig BIGINT NULL` to `Transactions` (metadata-only `NULL` column, `0ms` table rewrite) or create shadow table `Transactions_V2` with `BIGINT` identity.
   - **Step 2 (Trigger / Dual-Write)**: Populate `IdBig = Id` on every new `INSERT`/`UPDATE`.
   - **Step 3 (Chunked Backfill)**: Backfill historical rows in `2,500`-row keyset batches + build a unique nonclustered index `CREATE UNIQUE INDEX IX_Transactions_IdBig ON Transactions(IdBig) WITH (ONLINE = ON, WAIT_AT_LOW_PRIORITY ...)`.
   - **Step 4 (Metadata Swap / Partition Switch)**: Drop the old PK constraint online and promote `IdBig` (or execute instantaneous metadata `sp_rename` inside a `WAIT_AT_LOW_PRIORITY` window with dual-column view compatibility).

---

### Question 2: The FinOps / Cost Defense Axis — Managed CDC Cluster vs. Application Dual-Write + Outbox
> *"To migrate our `CustomerProfiles` table to a new microservice database, the data team proposed spinning up a dedicated multi-AZ Kafka Connect + Debezium cluster costing $4,800/month. We only have 80 writes/second. Defend the 80%-good alternative at 5% of the cost."*

**Principal Defense**:
1. **Right-Size the Migration Tooling to the Write Volume**: At `80 writes/sec`, provisioning a $4,800/month Kafka + Debezium cluster for a one-time table migration is severe infrastructure waste.
2. **The $150/month Principal Alternative**:
   - Use our existing **Transactional Outbox** (or SQL Server **Change Tracking** `CHANGETABLE(CHANGES ...)` which is built into the database engine at `$0` extra license cost!).
   - A single `IHostedService` worker (`AdaptiveBackfillOrchestrator`) streams incremental changes via `CHANGETABLE` and runs a keyset backfill + shadow-read comparison.
