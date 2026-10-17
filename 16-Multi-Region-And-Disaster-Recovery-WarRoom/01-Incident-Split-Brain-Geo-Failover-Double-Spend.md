# Incident 01: The Automated Geo-Failover Split-Brain & $640k Double-Spend

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Multi-Region Active-Passive Wallet Ledger (`us-east-1` Primary / `us-west-2` Standby)  
> **Business Impact**: A 22-second transatlantic BGP flap triggered premature auto-failover to `us-west-2` while `us-east-1` pods continued committing local withdrawals for 18 seconds (`$640,000` double-spend + diverged WAL timelines)  
> **Competencies Mastered**: Split-Brain Dual-Primary Prevention, STONITH / Consensus Lease Epoch Fencing, Minimum Failover Hysteresis vs. Lease TTL, Diverged WAL Timeline Reconciliation

---

## 🚨 1. The 02:50 AM Crisis Briefing

An external health-check watchdog monitoring `us-east-1` from Europe experienced a `22-second` BGP route flap and automatically triggered a database promotion of `us-west-2` (`Promote Standby to Primary`). However, `us-east-1` was **not dead** — US customers connected via local Anycast POPs continued executing wallet withdrawals against `us-east-1` for 18 seconds while `us-west-2` simultaneously accepted withdrawals for the same wallets!

```text
[02:50:00] External Watchdog: 3 consecutive probes to us-east-1 timed out (15s total). Triggering Geo-Failover!
[02:50:04] us-west-2 DB: Promoted to Read-Write Primary (Timeline #2)!
[02:50:05] RED HERRING: NOC declares "Smooth 5-second automated DR failover succeeded with zero issues!"
[02:50:22] Ledger Alert: CRITICAL — Both us-east-1 (Timeline #1) and us-west-2 (Timeline #2) accepted writes concurrently for 18 seconds! 412 accounts double-withdrawn ($640,000)!
```

> 📐 **Derive It (Fermi Mode): The Split-Brain Overlap Window ($	ext{Lease TTL} > 	ext{Failover Trigger}$)**
> - **Inputs**: `WatchdogTriggerSec = 15`, `OldPrimaryLeaseTtlSec = 35`, `WithdrawalRPS = 450`, `AvgWithdrawalUSD = 80`
> - **Formula**: `SplitBrainDualWriteWindowSec = OldPrimaryLeaseTtlSec - WatchdogTriggerSec`
> - **Step-by-Step**:
>   1. The external watchdog promoted `us-west-2` after just `15 seconds` of probe timeouts (`T+15s`).
>   2. Meanwhile, `us-east-1` still held a valid local authority lease until `T+33s` (an **`18-second` dual-primary overlap window** where both regions believed they were the sole Primary!).
>   3. During those 18 seconds, $450	ext{ RPS} 	imes 18	ext{ s} = 8,100	ext{ transactions}$ committed onto `us-east-1`'s orphaned WAL branch (`Timeline #1`) that `us-west-2` (`Timeline #2`) never received, enabling concurrent double-withdrawals totaling `$640,000`!
> - **What-If Sensitivity**: Enforcing the **Fundamental Fencing Inequality ($	ext{PromotionWaitTime} > 	ext{PrimaryLeaseTTL} + 	ext{MaxClockSkew}$)** — e.g., Primary must renew a 3-region consensus lease every `3s` (expiring hard at `10.0s` and halting all local commits immediately), while Standby cannot promote until `12.0s` — reduces the dual-primary overlap window from `18 seconds` to **`-2.0 seconds` (mathematically zero overlap)**!

<!-- TELEMETRY_WIDGET: title="Dual-Primary Split-Brain Overlap Window" metric1="Active Write Primaries (1 vs 2!)" metric2="Orphaned WAL Commits" threshold="1 Maximum Active Primary Invariant" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Expose the "Smooth Failover" Red Herring — check WAL Timeline divergence on both DB nodes!
psql -h db-us-east-1 -U principal -d walletdb -c "SELECT timeline_id, redo_lsn FROM pg_control_checkpoint();"
psql -h db-us-west-2 -U principal -d walletdb -c "SELECT timeline_id, redo_lsn FROM pg_control_checkpoint();"
# Output: us-east-1 is on timeline_id=1 at LSN 4A/9980120; us-west-2 forked to timeline_id=2 at earlier LSN 4A/8100000!

# Step 2: Extract orphaned transactions committed on Timeline #1 after the fork LSN 4A/8100000
psql -h db-us-east-1 -U principal -d walletdb -c "
SELECT tx_id, account_id, amount, created_at FROM ledger_withdrawals
WHERE pg_current_wal_lsn() > '4A/8100000'::pg_lsn AND created_at >= '2026-10-17 02:50:00Z';"
```

### Observed Culprit Failover Script
```python
# ❌ DANGEROUS SINGLE-VANTAGE AUTO-FAILOVER WITHOUT FENCING OLD PRIMARY FIRST:
if ping_failures("us-east-1") >= 3: # Only 15 seconds from a single EU probe!
    # ❌ Promotes us-west-2 WITHOUT revoking us-east-1's write lease or waiting for lease expiry!
    promote_standby_to_primary("us-west-2")
    update_dns("us-west-2")
```

<!-- PREDICT_GATE: Commit your hypothesis: Why can a single external probe vantage point never safely trigger an automated database failover, and what mathematical inequality between `PrimaryLeaseTTL` and `StandbyPromotionDelay` guarantees zero split-brain? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Single-Vantage Health Probes Cause False-Positive Split-Brain
* A probe running in `eu-west-1` failing to reach `us-east-1` only proves that the **`eu-west-1` $\leftrightarrow$ `us-east-1` link is degraded** — it does NOT prove `us-east-1` is down!
* Automated failover decisions require a **3-Vantage Quorum (Witness Region C + Region A + Region B)** AND **STONITH (Shoot The Other Node In The Head) Lease Fencing**.

### 2. The Mathematical Proof of Lease-Fenced Zero-Overlap Failover
Let:
* $T_{	ext{lease}}$ = Maximum duration the Primary DB/App can continue accepting writes without a successful quorum lease renewal (e.g., `10.0 seconds` measured by local monotonic clock `Stopwatch.GetTimestamp()`).
* $T_{	ext{promote}}$ = Minimum wait time after the quorum witness revokes/stops renewing the Primary's lease before the Standby DB opens for writes (e.g., `12.0 seconds`).
* Because $T_{	ext{promote}} (12.0	ext{s}) > T_{	ext{lease}} (10.0	ext{s}) + \Delta_{	ext{clock\_drift}} (0.01	ext{s})$, the old Primary is **guaranteed to have halted all local writes at least `1.99 seconds` BEFORE the new Primary accepts its very first transaction**!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Diagnostics;

namespace PrincipalJourney.MultiRegion.WarRoom;

/// <summary>
/// Uses hardware monotonic Stopwatch ticks (immune to NTP wall-clock jumps!) to enforce
/// that a Primary node halts writes strictly BEFORE a Standby node can complete promotion.
/// </summary>
public sealed class MonotonicLeaseFencingGuard
{
    private static readonly TimeSpan MaxSafeWriteLeaseWindow = TimeSpan.FromSeconds(10);
    private long _lastQuorumRenewalTimestamp = Stopwatch.GetTimestamp();
    private volatile long _activeEpoch;

    public void RecordQuorumLeaseRenewal(long confirmedEpoch)
    {
        _activeEpoch = confirmedEpoch;
        _lastQuorumRenewalTimestamp = Stopwatch.GetTimestamp();
    }

    public long AssertPrimaryWriteLeaseValidOrThrow()
    {
        TimeSpan elapsedSinceRenewal = Stopwatch.GetElapsedTime(_lastQuorumRenewalTimestamp);

        // Hard Monotonic Cutoff: If 10.0s have elapsed since last 2-of-3 quorum ACK,
        // immediately reject all local writes (2 full seconds before Standby is allowed to promote at 12.0s!).
        if (elapsedSinceRenewal >= MaxSafeWriteLeaseWindow)
        {
            throw new InvalidOperationException(
                $"SPLIT-BRAIN FENCE TRIGGERED: Quorum lease expired ({elapsedSinceRenewal.TotalSeconds:F2}s >= 10.0s). Halting writes.");
        }

        return _activeEpoch;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unfenced 15s Single-Probe Failover) | After (3-Region Quorum + Monotonic `10s < 12s` Lease Fence) | Validation & Rollback Procedure |
|---|---|---|---|
| **Dual-Primary Overlap Window** | `+18.0 seconds` (`$640k` double-spend) | **`0.00 seconds`** (`-2.0s` safety margin) | Chaos partition test severs `us-east` WAN; assert `us-east` halts writes at `T+10.0s` and `us-west` opens at `T+12.0s`. |
| **False-Positive BGP Flap Failovers** | Triggered on 1-probe flap | **`0`** (Requires 2-of-3 witness quorum + network-isolated lease loss) | Use `pg_rewind` in runbook to rejoin fenced old primary cleanly. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why did you use `Stopwatch.GetTimestamp()` instead of `DateTimeOffset.UtcNow` to check if the 10-second write lease expired?"*

**The Principal Defense**:
> *"`DateTimeOffset.UtcNow` reads the OS system wall clock, which can jump backward or freeze for several seconds when the `ntpd`/`chrony` daemon corrects clock drift! If the NTP daemon steps the clock backward by 3 seconds during a network partition, `DateTimeOffset.UtcNow` tricks the old Primary into thinking its 10-second lease still has 3 seconds left while the Standby has already promoted! `Stopwatch.GetTimestamp()` uses the CPU's monotonic hardware timer (`CLOCK_MONOTONIC` / TSC), which never steps backward."*

### Question 2 (The Second-Order Failure Mode):
> *"Once a split-brain HAS happened and `us-east-1` has 18 seconds of orphaned WAL commits on Timeline #1 while `us-west-2` is live on Timeline #2, why can't you just re-attach `us-east-1` as a replica?"*

**The Principal Defense**:
> *"Because `us-east-1`'s data pages contain committed LSNs ahead of the fork point that do not exist on Timeline #2! You must first extract the orphaned transactions from `us-east-1` into a reconciliation audit table for financial settlement, and then run **`pg_rewind`** (in PostgreSQL) to rewind `us-east-1` back to the exact LSN where Timeline #2 forked before it can follow the new primary!"*

### Question 3 (The FinOps / Cost Axis):
> *"To eliminate async failover split-brain, the database vendor wants us to migrate to a 3-Region Global Synchronous Spanner/CockroachDB deployment costing $58,000/month and adding 72ms to every write. Defend the 80%-good alternative."*

**The Principal Defense**:
> *"We achieve **`RPO = 0` and zero split-brain** at `$8,500/month` (`85%` cheaper) and `< 12ms` latency by running **Synchronous Quorum Replication across 3 Availability Zones (or between `us-east-1` and `us-east-2` 11ms apart)** paired with **Monotonic Lease Fencing (`10s` lease / `12s` promotion)** to `us-west-2`! We get sub-12ms writes, zero split-brain, and save **$594,000/year**."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1601 — Unfenced Geo-Failover Split-Brain & Double-Spend

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 18 minutes | **Mitigation Latency (TTM)**: 32 minutes

## Five Whys Root Cause Chain
1. **Why were 412 accounts double-withdrawn?** -> Both `us-east-1` and `us-west-2` accepted primary writes concurrently for 18 seconds.
2. **Why was `us-west-2` promoted while `us-east-1` was still alive?** -> A single EU probe experienced a 22s BGP flap and triggered auto-failover.
3. **Why didn't `us-east-1` stop accepting writes before `us-west-2` promoted?** -> No monotonic consensus lease fencing (`T_promote > T_lease`) existed.
4. **Why did async replication drop 18s of `us-east-1` transactions?** -> Promoting an async replica forks a new WAL timeline, orphaning un-shipped commits on the old primary.
5. **Why did NOC celebrate a 'smooth 5s failover'?** -> Dashboards monitored only `us-west-2` promotion speed, not active primary count (`count(db_is_in_recovery == 0) > 1`).

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Enforce `MonotonicLeaseFencingGuard` (`10s` lease < `12s` promotion) + 3-vantage witness quorum | Core Ledger | Chaos test proves 0ms dual-primary overlap |
| P0 | Disable unattended auto-promotion on async cross-region links without lease revocation confirmation | SRE / DBA | Alert fires immediately if `count(primary_db) > 1` |
```
