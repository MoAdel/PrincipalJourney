# Sprint 15: Zero-Downtime Data Evolution & Billion-Row Migrations

> **Competency Track**: Expand/Contract Migrations, `Sch-M` & `ACCESS EXCLUSIVE` Lock Internals, Keyset Billion-Row Backfills, Lock Escalation Prevention, Dual-Write/CDC Cutovers, and Shadow-Read Verification.

---

## Complete Chapter Navigation Manifest (`01`–`12`)

| # | Chapter | Core Focus |
|---|---|---|
| **01** | [`01-Story.md`](./01-Story.md) | The 14-Millisecond Migration That Froze Black Friday (`Sch-M` FIFO queue trap). |
| **02** | [`02-Learning-Objectives.md`](./02-Learning-Objectives.md) | Principal Data Evolution Competency Matrix. |
| **03** | [`03-Zero-Downtime-Migration-Requirements.md`](./03-Zero-Downtime-Migration-Requirements.md) | N-1 compatibility SLAs, lock timeout gates, and startup decoupling. |
| **04** | [`04-Expand-And-Contract-Architecture.md`](./04-Expand-And-Contract-Architecture.md) | The 5-Phase Parallel Change Protocol (Expand, Dual-Write, Backfill, Switch, Contract). |
| **05** | [`05-Database-Metadata-Locks-And-DDL-Internals.md`](./05-Database-Metadata-Locks-And-DDL-Internals.md) | SQL Server `WAIT_AT_LOW_PRIORITY` and PostgreSQL `lock_timeout` retry loops. |
| **06** | [`06-Backfilling-Billion-Row-Tables.md`](./06-Backfilling-Billion-Row-Tables.md) | Lock escalation math (`📐 Derive It`), WAL bandwidth sizing, and adaptive C# backfill worker. |
| **07** | [`07-Dual-Write-And-Shadow-Read-Verification.md`](./07-Dual-Write-And-Shadow-Read-Verification.md) | Defeating dual-write race conditions, CDC shadow sync, and reverse-CDC rollback insurance. |
| **08** | [`08-EF-Core-And-Flyway-Migration-Pipelines.md`](./08-EF-Core-And-Flyway-Migration-Pipelines.md) | EF Core migration bundles, least-privilege runtime identities, and CI destructive-DDL linters. |
| **09** | [`09-Hands-On-Data-Evolution-Labs.md`](./09-Hands-On-Data-Evolution-Labs.md) | Reproducing `Sch-M` lock chains and benchmarking 5,000-row lock escalation. |
| **10** | [`10-Production-Incident-Post-Mortem.md`](./10-Production-Incident-Post-Mortem.md) | Post-Mortem: Un-guarded Foreign Key Validation Scan Locking 85M Rows. |
| **11** | [`11-Principal-Data-Evolution-Defense-Questions.md`](./11-Principal-Data-Evolution-Defense-Questions.md) | `INT` to `BIGINT` emergency migration & CDC vs. Change-Tracking FinOps defense. |
| **12** | [`12-Summary.md`](./12-Summary.md) | The 10 Invariant Laws of Zero-Downtime Data Evolution. |
