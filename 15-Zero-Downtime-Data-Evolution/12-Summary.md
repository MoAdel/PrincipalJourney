# 12 — Sprint 15 Executive Summary & The 10 Laws of Zero-Downtime Data Evolution

---

## The 10 Invariant Laws

1. **Law 1 (N-1 Schema Compatibility)**: A database migration deployed in Release $N$ must never break running pods from Release $N-1$.
2. **Law 2 (Never Migrate on Pod Boot)**: Never call `Database.Migrate()` inside `Program.cs`. Run migrations as a dedicated, gated CI/CD stage with least-privilege credentials.
3. **Law 3 (Respect the `Sch-M` / `ACCESS EXCLUSIVE` Queue)**: Even a `5ms` metadata DDL will cause a total outage if it waits in line behind a `45s` query. Always use `WAIT_AT_LOW_PRIORITY` or `SET lock_timeout = '400ms'`.
4. **Law 4 (Never Rename or Drop In-Place)**: Use the 5-phase **Expand -> Dual-Write -> Backfill -> Read Cutover -> Contract** pattern.
5. **Law 5 (Never Select `*`)**: Explicit column lists in queries prevent additive schema expansions from breaking ORM buffer mappings or network caches.
6. **Law 6 (Stay Below 5,000 Locks per Batch)**: Chunk all backfills into keyset-paginated batches of `1,000–2,500` rows with `DEADLOCK_PRIORITY LOW` to prevent Lock Escalation.
7. **Law 7 (Throttle on Replica Redo Queue)**: Backfill workers must dynamically query read-replica replication lag (`redo_queue_size` / `pg_stat_replication`) and pause when lag exceeds threshold.
8. **Law 8 (Two-Phase Constraint Validation)**: Always add foreign keys and check constraints with `NOT VALID` / `WITH NOCHECK` first, then validate online.
9. **Law 9 (Shadow-Read Before Cutover)**: Prove data parity by comparing primary vs. candidate reads asynchronously in dark mode before switching customer read traffic.
10. **Law 10 (Keep Reverse Sync for Rollback)**: After cutting writes over to a new store, stream reverse CDC back to the old store for the duration of the rollback window so rolling back never loses committed transactions.
