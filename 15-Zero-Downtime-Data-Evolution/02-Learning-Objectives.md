# 02 — Learning Objectives: Zero-Downtime Data Evolution

---

## Principal Competency Matrix

| Competency Area | Senior Engineer Level | Principal Engineer Mastery |
|---|---|---|
| **Schema Evolution Pattern** | Writes `ALTER TABLE` / EF Core `Add-Migration` and runs during maintenance windows. | Executes 5-phase **Expand and Contract (Parallel Change)** with zero downtime at `10,000+ RPS`. |
| **DDL Lock Internals** | Knows `ONLINE = ON` helps index creation. | Controls `WAIT_AT_LOW_PRIORITY` (SQL Server) and `lock_timeout` (PostgreSQL) to prevent `Sch-M` / `ACCESS EXCLUSIVE` lock queues. |
| **Billion-Row Backfills** | Runs `UPDATE Table SET Col = X WHERE Col IS NULL` in one transaction. | Designs keyset-paginated batch workers (`< 4,000 rows/tx`) staying below the `5,000`-lock escalation threshold while throttling on replica lag. |
| **Table/Engine Cutovers** | Takes 2-hour downtime to dump and restore data. | Orchestrates Dual-Write, CDC backfill, Shadow-Read diff verification, and feature-flagged atomic read cutovers with instant rollback. |
