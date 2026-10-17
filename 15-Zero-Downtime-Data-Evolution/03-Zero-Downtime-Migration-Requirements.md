# 03 — Zero-Downtime Migration SLAs & Invariant Requirements

---

## 1. Production Data Evolution Invariants

| Requirement ID | Invariant Rule | Automated CI / DB Gate | Validation & Rollback |
|---|---|---|---|
| **ZDM-01** | **N-1 Backward Compatibility**: Every DDL migration deployed in Release $N$ must pass 100% of Release $N-1$'s integration test suite without code changes. | CI runs Release $N-1$ container tests against Release $N$ migrated database before approval. | If $N$ code rolls back, database schema remains untouched and functional for $N-1$. |
| **ZDM-02** | **No Unbounded DDL Lock Waits**: Every DDL statement must specify an explicit lock acquisition timeout (`lock_timeout = '2s'` or `WAIT_AT_LOW_PRIORITY`). | SQL migration linter rejects any `ALTER TABLE` / `CREATE INDEX` missing low-priority wait or timeout guards. | DDL aborts harmlessly after 2s and retries with backoff rather than blocking live traffic. |
| **ZDM-03** | **Zero Lock Escalation on Backfills**: Data migration batches must never acquire $\ge 5,000$ row/page locks or hold a transaction open for $> 250\text{ ms}$. | Backfill worker enforces `BatchSize <= 2500` with adaptive sleep on `redo_queue_size`. | Pause backfill job via config toggle in `< 1s`. |
| **ZDM-04** | **Decoupled Startup**: Application pods must NEVER run `Database.Migrate()` on boot. | `NetArchTest` forbids calling `RelationalDatabaseFacadeExtensions.Migrate*` inside `WebApplication` startup assemblies. | Migrations run as isolated pre-deploy jobs. |
