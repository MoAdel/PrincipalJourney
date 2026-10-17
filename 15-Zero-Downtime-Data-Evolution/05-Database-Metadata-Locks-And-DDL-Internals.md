# 05 — Database Metadata Locks (`Sch-M` vs. `ACCESS EXCLUSIVE`) & Low-Priority Waits

---

## 1. SQL Server: Defeating the `Sch-M` Blocking Queue with `WAIT_AT_LOW_PRIORITY`

In standard SQL Server, requesting an online index build rebuild (`CREATE INDEX ... WITH (ONLINE = ON)`) or partition switch still requires a brief `Sch-M` lock at the start and end of the operation. Without `WAIT_AT_LOW_PRIORITY`, that `Sch-M` request blocks all new `Sch-S` queries!

```sql
-- ❌ DANGEROUS: If a 30s reporting query is running, this blocks ALL live OLTP traffic for 30s!
ALTER INDEX IX_Orders_CustomerId ON dbo.Orders REBUILD WITH (ONLINE = ON);

-- ✅ PRINCIPAL PATTERN: Wait in a separate low-priority queue; let new OLTP queries pass!
-- If the lock cannot be acquired within 1 minute, abort our DDL rather than hurting customers!
ALTER INDEX IX_Orders_CustomerId ON dbo.Orders
REBUILD WITH (
    ONLINE = ON (
        WAIT_AT_LOW_PRIORITY (
            MAX_duration = 1 MINUTES,
            ABORT_AFTER_WAIT = SELF   -- Kill the migration script, NEVER block user traffic!
        )
    ),
    RESUMABLE = ON,
    MAX_DURATION = 60 MINUTES
);
```

---

## 2. PostgreSQL: Guarding `ACCESS EXCLUSIVE` with `lock_timeout` Loop

In PostgreSQL, `ALTER TABLE` acquires an `ACCESS EXCLUSIVE` lock. Always wrap DDL in a short `lock_timeout` retry loop so the migration never sits in the lock queue for more than `500ms`:

```sql
-- PostgreSQL Safe Zero-Downtime DDL Wrapper
DO $$
DECLARE
    v_attempt INT := 1;
    v_max_attempts INT := 20;
BEGIN
    -- Never allow a statement inside this session to run forever
    SET LOCAL statement_timeout = '10s';
    -- Never wait in the ACCESS EXCLUSIVE lock queue for more than 400ms!
    SET LOCAL lock_timeout = '400ms';

    WHILE v_attempt <= v_max_attempts LOOP
        BEGIN
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_tier VARCHAR(32) NULL;
            RAISE NOTICE 'DDL succeeded on attempt %', v_attempt;
            EXIT;
        EXCEPTION WHEN lock_not_available THEN
            RAISE WARNING 'Attempt % failed to acquire lock within 400ms; backing off...', v_attempt;
            v_attempt := v_attempt + 1;
            PERFORM pg_sleep(1.5);
        END;
    END LOOP;

    IF v_attempt > v_max_attempts THEN
        RAISE EXCEPTION 'Aborted DDL after % attempts to protect live OLTP traffic.', v_max_attempts;
    END IF;
END $$;
```
