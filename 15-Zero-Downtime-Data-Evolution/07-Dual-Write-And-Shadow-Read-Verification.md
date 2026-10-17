# 07 — Dual-Write, CDC Synchronization & Shadow-Read Consistency Verification

---

## 1. Avoiding the "Dual-Write Race Condition" Trap

When migrating from a Legacy Table/DB (`Store A`) to a New Sharded Table/DB (`Store B`), naive application dual-writing suffers from non-atomic partial failures and out-of-order race conditions:

```text
❌ NAIVE DUAL-WRITE RACE CONDITION:
Thread 1 (Update Price=$10): Writes Store A ($10) ─────────────────────────► Writes Store B ($10) [FINAL: $10]
Thread 2 (Update Price=$20):        Writes Store A ($20) [FINAL: $20] ─► Writes Store B ($20)
Result: Store A has $20, Store B has $10 -> PERMANENT DATA CORRUPTION!
```

### The Principal Solution: Single-Source-of-Truth + Outbox/CDC Pipeline

| Cutover Stage | Write Path | Read Path | Consistency Verification | Rollback Procedure |
|---|---|---|---|---|
| **Stage 1: CDC Shadow Sync** | Write `Store A` only; Debezium/Outbox streams changes to `Store B` ordered by LSN/Version. | Read `Store A` (`100%`). | Background verifier compares row hashes between `Store A` and `Store B`. | Drop `Store B` consumer; zero impact on `Store A`. |
| **Stage 2: Dark Shadow Reads** | Same as Stage 1. | Read `Store A` (primary) + async fire-and-forget read `Store B` (`1%` -> `100%`). | Emit metric `shadow_read_mismatch_total`; must hold at `0` for 72 hours. | Disable shadow read feature flag. |
| **Stage 3: Read Cutover** | Same as Stage 1. | Read `Store B` (`10%` -> `100%`). | Monitor $p99$ latency and error rate on `Store B`. | Flip read flag back to `Store A` in `< 1s`. |
| **Stage 4: Write Cutover + Reverse CDC** | Write `Store B` as source of truth; stream reverse CDC back to `Store A` for 7 days! | Read `Store B` (`100%`). | Reverse CDC keeps `Store A` hot in case an emergency rollback is needed 3 days later! | Flip write flag back to `Store A` without losing writes made during Stage 4. |
