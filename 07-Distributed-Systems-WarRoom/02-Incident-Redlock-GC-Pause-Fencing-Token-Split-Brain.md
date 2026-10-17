# Incident 02: The Stop-The-World GC Pause Distributed Lock Split-Brain

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Redis Distributed Lock (`Redlock`) + Blob/SQL Ledger Settlement Worker  
> **Business Impact**: Two worker pods concurrently executed the daily ACH bank wire file generation, transmitting $2.1M in duplicate wire transfers  
> **Competencies Mastered**: Kleppmann's Critique of Redlock, Stop-The-World GC / Network Pause vs. Lock TTL, Monotonic Fencing Tokens (`INCR` + Storage Epoch Verification)

---

## 🚨 1. The 01:05 AM Crisis Briefing

To guarantee that only one pod generated the nightly ACH wire batch, the team wrapped the job in a Redis Distributed Lock (`SET lock:ach-wire <guid> NX PX 5000` with a `5-second` TTL). At `01:00:04 AM`, the bank received **two** overlapping wire files:

```text
[01:00:00.010] Pod-A: Acquired Redis lock 'lock:ach-wire' (TTL = 5000ms).
[01:00:03.800] Pod-A: Enters 3.4-second GC Gen2 / LOH compaction + CFS CPU throttling pause right before transmitting!
[01:00:05.015] Redis: Lock 'lock:ach-wire' expires at 5000ms!
[01:00:05.050] Pod-B: Acquires 'lock:ach-wire', builds batch, and transmits Wire File #1!
[01:00:07.200] Pod-A: Wakes up from pause (believing it still holds the lock!) and transmits Wire File #2!
```

> 📐 **Derive It (Fermi Mode): Lock TTL Expiration Under GC + CFS CPU Quota Throttling**
> - **Inputs**: `LockTtlMs = 5000`, `PrePauseElapsedMs = 3800`, `K8sCfsThrottlingPeriods = 22`, `CfsPeriodMs = 100`
> - **Formula**: `TotalElapsedBeforeWriteMs = PrePauseElapsedMs + (K8sCfsThrottlingPeriods * CfsPeriodMs)`
> - **Step-by-Step**:
>   1. Pod-A spent `3,800ms` building the wire batch (`1,200ms` remaining on the `5,000ms` Redis lock).
>   2. Triggering a Gen 2 GC while hitting Kubernetes Linux CFS CPU quota limits (`cpu.cfs_period_us = 100ms`) stalled Pod-A's threads across `22` scheduling periods ($22 \times 100\text{ ms} = 2,200\text{ ms}$).
>   3. Total wall-clock time reached $3,800 + 2,200 = 6,000\text{ ms} > 5,000\text{ ms}$ Lock TTL!
>   4. Because a distributed lock in Redis **cannot pause a thread inside Pod-A**, Pod-A resumed execution on the line immediately after `if (lockAcquired)` and committed a split-brain write `1,000ms` after Pod-B had taken over!
> - **What-If Sensitivity**: As Martin Kleppmann proved, **no lock TTL duration is ever 100% safe for correctness on its own**! Correctness requires the lock service to issue a **Monotonically Increasing Fencing Token (`fencing_epoch = 42`, then `43`)** and the target storage engine to **reject any write carrying `fencing_epoch < max_seen_epoch`**!

<!-- TELEMETRY_WIDGET: title="Distributed Lock Expiry & Fencing Split-Brain" metric1="Active Lock Epoch" metric2="Pod Pause Duration (ms)" threshold="5000 ms Lock TTL" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Check Linux container CFS CPU throttling stats inside the pod cgroup!
kubectl exec -n prod pod-a -- cat /sys/fs/cgroup/cpu.stat
# Output: nr_periods 14200 | nr_throttled 3890 | throttled_time_usec 412000000 (Pod was heavily CPU throttled!)

# Step 2: Correlate Pod-A and Pod-B write timestamps in the database
psql -h postgres-prod -U principal -d ledgerdb -c "
SELECT batch_id, worker_pod, created_at FROM ach_wire_batches WHERE settlement_date = CURRENT_DATE;"
```

### Observed Culprit Code Snippet
```csharp
// ❌ UNSAFE DISTRIBUTED LOCK FOR CORRECTNESS (NO FENCING TOKEN!):
if (await _redisLock.AcquireAsync("lock:ach-wire", ttl: TimeSpan.FromSeconds(5)))
{
    var batch = await BuildWireBatchAsync();
    // ⚠️ If thread pauses here for >5s (GC, CFS CPU throttle, page fault, TCP retransmit),
    // the Redis lock expires, Pod-B acquires it, and BOTH pods execute the line below!
    await _storage.CommitAndTransmitBatchAsync(batch);
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why can't checking `if (lock.IsStillLocked)` on the line right before `CommitAndTransmitBatchAsync` solve this race condition, and how do Monotonic Fencing Tokens guarantee safety? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why "Check Lock Right Before Write" Still Fails (TOCTOU)
* If Pod-A checks `if (lock.RemainingTtl > 0)` on line 10 and calls `storage.Write()` on line 11, the GC pause or TCP stall can happen **between line 10 and line 11** (Time-of-Check to Time-of-Use race)!
* Therefore, **the storage/resource layer itself must participate in lock verification** using a **Fencing Token**!

### 2. How Monotonic Fencing Tokens Work
1. When Pod-A acquires the lock, the lock service atomically increments and returns `FencingToken = 33`.
2. Pod-A stalls for 6 seconds; lock expires.
3. Pod-B acquires the lock and receives `FencingToken = 34`.
4. Pod-B writes to the database/storage passing `FencingToken = 34`. Storage records `MaxFencingToken = 34` and commits.
5. Pod-A wakes up and attempts to write passing `FencingToken = 33`. The database checks `WHERE @IncomingToken > MaxFencingToken` (`33 > 34` is **FALSE**), rejecting Pod-A's zombie write with a concurrency exception!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using StackExchange.Redis;

namespace PrincipalJourney.DistributedSystems.WarRoom;

public sealed class FencedDistributedLockCoordinator(IConnectionMultiplexer redis, IDbConnection dbConnection)
{
    // Lua script: Atomically acquire lock AND increment monotonic fencing counter!
    private const string AcquireWithFencingLua = @"
        if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
            return redis.call('INCR', KEYS[2])
        else
            return -1
        end";

    public async Task<long?> TryAcquireFencedLockAsync(string resourceName, string ownerId, TimeSpan ttl)
    {
        var db = redis.GetDatabase();
        long fencingToken = (long)await db.ScriptEvaluateAsync(
            AcquireWithFencingLua,
            keys: [$"lock:{resourceName}", $"fence:{resourceName}"],
            values: [ownerId, (long)ttl.TotalMilliseconds]);

        return fencingToken > 0 ? fencingToken : null;
    }

    public async Task CommitBatchWithFenceVerificationAsync(string resourceName, long fencingToken, string batchPayloadJson, CancellationToken ct)
    {
        // The storage layer ATOMICALLY verifies that no higher FencingToken has ever touched this resource!
        const string fencedWriteSql = @"
            UPDATE dbo.ResourceFences
            SET LastFencingToken = @FencingToken,
                UpdatedAtUtc = SYSUTCDATETIME()
            WHERE ResourceName = @ResourceName
              AND @FencingToken > LastFencingToken;

            IF @@ROWCOUNT = 0
                THROW 50001, 'Zombie write rejected: FencingToken is stale (superseded by newer lock holder)!', 1;

            INSERT INTO dbo.AchWireBatches (ResourceName, FencingToken, PayloadJson)
            VALUES (@ResourceName, @FencingToken, @PayloadJson);";

        await dbConnection.ExecuteAsync(new CommandDefinition(
            fencedWriteSql,
            new { ResourceName = resourceName, FencingToken = fencingToken, PayloadJson = batchPayloadJson },
            cancellationToken: ct));
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unfenced 5s Redis Lock) | After (Lua `INCR` Fencing Token + DB Fence Check) | Validation & Rollback Procedure |
|---|---|---|---|
| **Split-Brain Writes Under 10s Thread Pause** | `100%` (Both pods write) | **`0%`** (Zombie write rejected by `LastFencingToken` check) | Chaos test suspends Pod-A thread (`Thread.Sleep(6000)`) mid-lock while Pod-B runs; assert Pod-A throws `50001`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why do we need a SQL `ResourceFences` check if we use the official 5-node Redis `Redlock` algorithm?"*

**The Principal Defense**:
> *"As Martin Kleppmann proved in his famous analysis of Redlock, 5-node Redlock still relies on timing assumptions and **does not generate fencing tokens**! Even if 5 out of 5 Redis nodes agree Pod-A held the lock at `01:00:00`, if Pod-A freezes for 6 seconds due to GC or Linux CFS CPU throttling, all 5 Redis nodes will expire Pod-A's lock and grant it to Pod-B at `01:00:05`. Without a monotonic Fencing Token verified at the storage destination, 5-node Redlock fails the exact same way as 1-node Redis!"*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if the Redis node holding `fence:{resourceName}` crashes and restarts with an empty memory state (`INCR` resets to `1`, which is `< LastFencingToken = 34`)?"*

**The Principal Defense**:
> *"If the fencing counter is generated in volatile Redis without AOF `appendfsync always`, a Redis wipe resets the counter to `1`. Even better: since our destination is already a relational database (`dbo.ResourceFences` / `dbo.AchWireBatches`), **we don't even need Redis for correctness**! We can generate the fencing token or unique constraint (`UNIQUE (SettlementDate)`) directly inside the relational transaction using `sp_getapplock` or optimistic `RowVersion`, reserving Redis locks strictly as an **efficiency optimization** (to avoid wasted work) while the database enforces **correctness**!"*

### Question 3 (The FinOps / Cost Axis):
> *"A team wants to deploy a dedicated 5-node multi-AZ ZooKeeper / etcd cluster ($1,800/month) just to coordinate 4 nightly cron jobs. Defend the 80%-good alternative at $0 extra cost."*

**The Principal Defense**:
> *"Running a dedicated ZooKeeper/etcd cluster for 4 cron jobs is classic resume-driven architecture. Use **PostgreSQL Advisory Locks (`pg_try_advisory_xact_lock`)** or **SQL Server `sp_getapplock` + Unique Business Key Constraints (`UNIQUE (JobName, ExecutionDate)`)** on the database we already pay for (`$0/month` extra cost, zero network split-brain between lock service and storage service!)."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0702 — Distributed Lock GC/CFS Pause Split-Brain

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 15 minutes | **Mitigation Latency (TTM)**: 30 minutes

## Five Whys Root Cause Chain
1. **Why were two ACH wire files transmitted?** -> Pod-A and Pod-B both executed `CommitAndTransmitBatchAsync`.
2. **Why did Pod-B acquire the lock while Pod-A was still running?** -> Pod-A's 5,000ms Redis lock expired while Pod-A was paused for 3.4s.
3. **Why did Pod-A pause for 3.4s?** -> Gen 2 GC coincided with aggressive Kubernetes CFS CPU quota throttling (`limits.cpu: 500m`).
4. **Why wasn't Pod-A's stale write rejected?** -> Neither the lock service nor the database enforced monotonic Fencing Tokens.
5. **Why didn't the database reject the second batch?** -> Missing `UNIQUE (SettlementDate)` idempotency constraint on `AchWireBatches`.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Enforce Monotonic Fencing Token (`@FencingToken > LastFencingToken`) + `UNIQUE (SettlementDate)` | Payments Team | Chaos pause test in CI pipeline |
| P1 | Remove aggressive `limits.cpu` on latency/GC-sensitive worker pods | Platform Team | Monitor `container_cpu_cfs_throttled_periods_total` |
```
