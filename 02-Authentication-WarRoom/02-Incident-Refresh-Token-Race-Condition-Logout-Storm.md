# Incident 02: The Concurrent Refresh-Token Reuse Logout Storm

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: OAuth 2.0 / OIDC Identity Server + Multi-Tab SPA / Mobile Clients  
> **Business Impact**: 38% of active users forcibly logged out every 15 minutes upon access token expiry; 4,200 support tickets in 2 hours  
> **Competencies Mastered**: RFC 9700 Refresh Token Rotation, Reuse Detection Family Revocation, Grace Window Idempotency, Distributed Lock / Atomic CAS Rotation

---

## 🚨 1. The 10:15 AM Crisis Briefing

Following a security audit, the team enabled **Strict Refresh Token Rotation with Reuse Detection (RFC 9700)**: whenever a client exchanges `RefreshToken_1` for `RefreshToken_2`, `RefreshToken_1` is marked consumed; if `RefreshToken_1` is ever presented a second time, the server assumes token theft and **revokes the entire token family**, forcing immediate logout!

Fifteen minutes after deployment (matching the `15-minute` Access Token lifetime), customer sessions began collapsing en masse:

```text
[10:15:04] Security Alert: Refresh Token Reuse Theft Detection triggered 14,800 times in 60 seconds!
[10:15:18] RED HERRING: SOC Analyst declares "We are under a credential-stuffing / token-replay cyberattack from 14,000 residential IPs!"
[10:16:02] Product Alert: Active authenticated checkout sessions dropped by 38%!
```

> 📐 **Derive It (Fermi Mode): Multi-Tab / Multi-Widget Concurrent Refresh Collision Probability**
> - **Inputs**: `ConcurrentRequestsOnExpiry = 6`, `NetworkJitterWindowMs = 80`, `RotationGraceWindowMs = 0`
> - **Formula**: `FalsePositiveTheftRate = 1 - (1 / ConcurrentRequestsOnExpiry)`
> - **Step-by-Step**:
>   1. When a user opens a dashboard or switches tabs after 15 minutes, 6 UI components fire parallel API calls (`GET /profile`, `GET /orders`, `GET /notifications`, etc.), or 2 browser tabs refresh simultaneously.
>   2. Request 1 arrives at `T+0ms` with `RT_1`, rotates it to `RT_2`, and marks `RT_1 = Consumed`.
>   3. Request 2 (sent `12ms` later from the second browser tab before `localStorage` broadcast completed) arrives with the **same `RT_1`**.
>   4. With `RotationGraceWindowMs = 0`, the Identity Server treats Request 2's `12ms`-late arrival as a malicious replay attack and revokes the newly minted `RT_2` family, logging the legitimate user out!
> - **What-If Sensitivity**: Adding a **`10-second` Idempotent Rotation Grace Window** (returning the same rotated token pair for concurrent requests presenting `RT_1` from the same session binding within `10s`) drops false-positive logouts from `38%` to `0.001%` while preserving theft revocation for any replay outside the network jitter window!

<!-- TELEMETRY_WIDGET: title="Refresh Token Reuse False-Positive Storm" metric1="Family Revocations / min" metric2="Active User Sessions" threshold="100 Revocations/min Anomaly Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Cyberattack" Red Herring — check time delta between Original Consume and Replay!
psql -h postgres-prod -U principal -d identitydb -c "
SELECT
  width_bucket(EXTRACT(EPOCH FROM (replayed_at - consumed_at)) * 1000, 0, 1000, 10) AS delta_ms_bucket,
  COUNT(*) AS replay_events,
  COUNT(*) FILTER (WHERE original_ip = replay_ip) AS same_ip_count
FROM refresh_token_audit_log
WHERE event_type = 'REUSE_DETECTED' AND created_at > NOW() - INTERVAL '15 minutes'
GROUP BY 1 ORDER BY 1;"
# Output: 99.4% of 'replays' occurred within 5ms–180ms from the EXACT SAME IP & User-Agent!
```

### Observed Culprit Code Snippet
```csharp
// ❌ NAIVE STRICT ROTATION WITHOUT CONCURRENCY GRACE WINDOW:
public async Task<TokenResponse> RotateRefreshTokenAsync(string tokenHash, CancellationToken ct)
{
    var token = await _db.RefreshTokens.SingleAsync(t => t.TokenHash == tokenHash, ct);
    if (token.IsConsumed)
    {
        // Triggered 15ms later by Tab #2! Revokes the entire family and logs the user out!
        await RevokeEntireTokenFamilyAsync(token.FamilyId, ct);
        throw new SecurityTokenException("Refresh token reuse detected! Family revoked.");
    }
    token.IsConsumed = true;
    token.ConsumedAtUtc = DateTimeOffset.UtcNow;
    // ... mints new token and saves (also vulnerable to EF Core race condition without row version!)
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did 99.4% of reuse alerts occur within 180ms from the same IP, and how do you coordinate both Client-Side (multi-tab) and Server-Side (grace window) idempotency? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Client-Side Race Conditions (In-Tab & Cross-Tab)
* **In-Tab**: Covered by an HTTP Interceptor `BehaviorSubject` mutex.
* **Cross-Tab**: Two open browser tabs have separate JS heaps! Even if each tab has an internal HTTP interceptor mutex, Tab A and Tab B will both detect token expiry and call `/oauth/token` concurrently unless synchronized via the **Web Locks API (`navigator.locks.request('auth_refresh_lock', ...)` )** or handled idempotently on the server.

### 2. Server-Side Atomic Rotation + Idempotent Grace Period
* On the server, two concurrent threads executing `SELECT` then `UPDATE` without an atomic Compare-And-Swap (`UPDATE ... WHERE IsConsumed = 0`) or Redis cached grace-window response will either race or trigger false-positive family revocation.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Distributed;

namespace PrincipalJourney.Authentication.WarRoom;

public sealed class GraceWindowRefreshTokenRotator(
    IRefreshTokenRepository repository,
    IDistributedCache distributedCache,
    TimeProvider timeProvider)
{
    private static readonly TimeSpan NetworkJitterGraceWindow = TimeSpan.FromSeconds(10);

    public async Task<TokenPairResult> RotateAsync(string incomingTokenHash, string clientFingerprint, CancellationToken ct)
    {
        // 1. Attempt atomic database transition: UPDATE RefreshTokens SET IsConsumed = 1 WHERE TokenHash = @hash AND IsConsumed = 0
        var atomicConsume = await repository.TryConsumeAtomicallyAsync(incomingTokenHash, timeProvider.GetUtcNow(), ct);

        if (atomicConsume.WasFirstConsumer)
        {
            var newPair = await repository.MintSuccessorTokenPairAsync(atomicConsume.TokenRecord, ct);

            // Cache the newly minted pair under the OLD token hash for 10 seconds to serve concurrent tabs idempotently
            await distributedCache.SetStringAsync(
                key: $"rt_grace:{incomingTokenHash}:{clientFingerprint}",
                value: newPair.Serialize(),
                options: new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = NetworkJitterGraceWindow },
                token: ct);

            return newPair;
        }

        // 2. Token was ALREADY consumed! Check if we are within the 10-second same-client grace window:
        var cachedGraceResponse = await distributedCache.GetStringAsync($"rt_grace:{incomingTokenHash}:{clientFingerprint}", ct);
        if (cachedGraceResponse is not null)
        {
            // Legitimate concurrent browser tab / retry within 10s! Return the exact same rotated pair.
            return TokenPairResult.Deserialize(cachedGraceResponse);
        }

        // 3. Outside grace window OR different client fingerprint -> Genuine Token Theft! Revoke family!
        await repository.RevokeTokenFamilyAsync(atomicConsume.TokenRecord.FamilyId, reason: "ReuseOutsideGraceWindow", ct);
        throw new UnauthorizedAccessException("Compromised refresh token family revoked.");
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (Atomic CAS + 10s Grace Window) | Validation & Rollback Procedure |
|---|---|---|---|
| **False-Positive Family Revocations** | `14,800 / min` (38% users logged out) | **`0 / min`** for concurrent tabs (`< 10s` jitter) | k6 test fires 10 parallel `/oauth/token` calls with identical `RT_1`; assert all 10 receive valid `RT_2` and family remains active. |
| **Genuine Theft Revocation (>10s or Diff IP)** | Active | **100% Enforced** | Security test replays `RT_1` at `T+11s` or with different IP; assert `401` and immediate family revocation. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just disable Refresh Token Reuse Detection altogether so concurrent requests never revoke the session?"*

**The Principal Defense**:
> *"Disabling Reuse Detection violates **RFC 9700 (OAuth 2.0 Security Best Current Practice)** for public SPA/mobile clients. Without reuse detection, if an attacker steals a refresh token via XSS or device malware, both the attacker and victim can silently mint access tokens forever. A 10-second grace window bound to the client fingerprint eliminates 99.999% of concurrency false positives while still catching any asynchronous attacker replay."*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if the client's network drops AFTER the server rotates `RT_1 -> RT_2` and after the 10-second grace window expires, so the client never received `RT_2`?"*

**The Principal Defense**:
> *"If the TCP response carrying `RT_2` is lost on a mobile tunnel drop and the client retries `RT_1` 45 seconds later, `RT_2` was **never used** to make an API call or subsequent refresh. By tracking `SuccessorTokenUsed = true/false`, we distinguish between **Unacknowledged Rotation Retry** (`SuccessorTokenUsed == false` $ightarrow$ safely re-issue or rotate without revoking family) and **True Forked Replay** (`SuccessorTokenUsed == true` $ightarrow$ both `RT_1` and `RT_2` were actively used by two parties $ightarrow$ immediate family revocation!)."*

### Question 3 (The FinOps / Cost Axis):
> *"Storing every rotated refresh token audit trail in our primary SQL Server forever is growing our high-IOPS NVMe storage by 180 GB/month ($1,800/month). Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Active refresh token state belongs in **Redis with automatic key TTL matching the family expiration (e.g., 14 days)**, while immutable security audit events stream asynchronously to **Azure Blob Cold/Parquet storage ($3.50/month for 180 GB)** queryable via Athena/Synapse on demand. Primary SQL NVMe storage should hold zero transient token rotation history."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0202 — Concurrent Refresh-Token Reuse Logout Storm

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 4 minutes | **Mitigation Latency (TTM)**: 26 minutes

## Five Whys Root Cause Chain
1. **Why were 38% of users logged out every 15 minutes?** -> The Identity Server revoked their refresh token families.
2. **Why were families revoked?** -> Concurrent tabs/widgets presented the same refresh token within 5–180ms of each other.
3. **Why did the second request trigger theft detection?** -> Rotation had a 0ms grace period and lacked `SuccessorTokenUsed` fork verification.
4. **Why did the client send multiple parallel refresh requests?** -> Browser tabs did not coordinate via `navigator.locks` (`Web Locks API`).
5. **Why did SOC initially suspect a cyberattack?** -> Security dashboards did not display the millisecond delta (`replayed_at - consumed_at`) or IP match rate.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Implement Atomic CAS + 10s Grace Window + `SuccessorTokenUsed` fork check | Identity Team | Concurrency integration test (20 parallel threads) in CI |
| P1 | Add `navigator.locks.request('auth_refresh')` cross-tab coordination in Frontend SDK | Frontend Arch | Playwright multi-tab token expiry test |
```
