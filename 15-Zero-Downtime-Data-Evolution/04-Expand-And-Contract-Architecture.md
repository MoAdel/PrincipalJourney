# 04 — The 5-Phase Expand and Contract (Parallel Change) Architecture

> "You never rename, drop, or change the type of a column in place. You expand the schema, dual-write, backfill, shift reads, and contract only after the rollback window expires."

---

## 1. Concrete Scenario: Splitting `FullName` into `FirstName` and `LastName` on 500M Users

```text
Phase 1 (EXPAND)      Phase 2 (DUAL-WRITE)     Phase 3 (BACKFILL)     Phase 4 (READ SWITCH)   Phase 5 (CONTRACT)
┌──────────────┐      ┌──────────────────┐     ┌────────────────┐     ┌──────────────────┐    ┌────────────────┐
│ Add nullable │      │ App writes BOTH  │     │ Chunked worker │     │ App reads ONLY   │    │ Drop legacy    │
│ FirstName &  │─────►│ FullName AND     │────►│ backfills NULL │────►│ FirstName/Last;  │───►│ FullName col   │
│ LastName cols│      │ FirstName/Last   │     │ rows in batches│     │ stops reading old│    │ after 7 days   │
└──────────────┘      └──────────────────┘     └────────────────┘     └──────────────────┘    └────────────────┘
```

| Phase | Database State | Application Code State | Rollback Safety |
|---|---|---|---|
| **Phase 1: Expand** | Add `FirstName NVARCHAR(100) NULL`, `LastName NVARCHAR(100) NULL`. | `v1` running (unaware of new columns). | 100% safe: new columns are nullable and ignored by `v1`. |
| **Phase 2: Dual-Write** | Both old and new columns exist. | Deploy `v2`: writes to `FullName`, `FirstName`, and `LastName`. Reads still come from `FullName` (or fallback). | **Instant Rollback**: If `v2` rolls back to `v1`, `FullName` has 100% of recent writes! |
| **Phase 3: Backfill** | Idempotent chunked job populates `FirstName`/`LastName` where `NULL`. | `v2` continues dual-writing. | Job can be paused/restarted at any keyset cursor. |
| **Phase 4: Read Switch** | Add `CHECK (FirstName IS NOT NULL) WITH NOCHECK` then verify. | Deploy `v3`: reads from `FirstName`/`LastName`; stops writing `FullName` (after making `FullName` nullable). | Feature flag switches read path back in `< 1s` if discrepancy detected. |
| **Phase 5: Contract** | `ALTER TABLE Users DROP COLUMN FullName;` | `v3` running purely on new columns. | Executed only after `v3` has been stable for $\ge 7$ days. |
