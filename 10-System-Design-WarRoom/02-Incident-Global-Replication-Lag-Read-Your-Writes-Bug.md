# Incident 02: The Read-Replica Lag "Read-Your-Own-Writes" Double-Payment Bug

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Primary SQL + 3 Asynchronous Read Replicas (`ReadIntent=ReadOnly`) / Checkout & Order History Service  
> **Business Impact**: 1,420 customers charged twice ($184,600) because `/order-confirmation` routed to a lagging read replica, showed "Order Not Found — Payment Failed?", and prompted an immediate re-submit  
> **Competencies Mastered**: Read-Your-Own-Writes Consistency, Asynchronous WAL Replication Lag, Causal Session Tokens (`LSN` / `WriteTimestamp` Cookie Pinning), Command-Query Read Routing

---

## 🚨 1. The 01:15 PM Crisis Briefing

To offload read traffic from the Primary SQL database, the team routed all `GET` endpoints to Asynchronous Read Replicas (`ApplicationIntent=ReadOnly`). During a peak promotion (`950ms` replication lag), customers clicked **"Pay Now"**, received `201 Created`, were redirected `80ms` later to `GET /orders/{id}/confirmation`, and saw **`404 Order Not Found`**!

```text
[13:15:10] Support Alert: Customers seeing "Order Not Found" on confirmation screen right after card charge!
[13:15:30] RED HERRING: Frontend Dev says "The POST /checkout API must be returning 201 Created before committing the SQL transaction!"
[13:16:05] DBA Metric: Read-Replica #2 replication lag is 950ms; GET /orders/{id} arrives 80ms after commit!
```

> 📐 **Derive It (Fermi Mode): Probability of `404` on Post-Redirect-Get Under Async Replica Lag**
> - **Inputs**: `BrowserRedirectRTTMs = 80`, `AsyncReplicaLagMs = 950`, `ReadReplicaCount = 3`
> - **Formula**: `StaleReadWindowMs = AsyncReplicaLagMs - BrowserRedirectRTTMs`
> - **Step-by-Step**:
>   1. `POST /checkout` commits on the Primary DB at `T+0ms` and returns `201 Created` to the browser.
>   2. The browser follows the redirect and calls `GET /orders/{id}` at `T+80ms`.
>   3. However, the Asynchronous Read Replica does not receive and replay that WAL commit until `T+950ms` (`870ms` *after* the browser's `GET` arrives)!
>   4. `100%` of post-mutation redirects arriving inside that `870ms` window read stale replica state (`404 Not Found`), causing panicked users to click "Pay" a second time!
> - **What-If Sensitivity**: Pinning a user's `GET` requests to the **Primary DB for `5 seconds` after any mutation** (via an HTTP-only `x-last-write-utc` cookie or passing the committed Postgres `pg_current_wal_lsn()` / SQL LSN) restores **100% Read-Your-Own-Writes consistency** while still offloading **96% of passive browsing reads** to Read Replicas!

<!-- TELEMETRY_WIDGET: title="Post-Mutation Stale Replica 404s" metric1="Replica WAL Lag (ms)" metric2="Post-Checkout 404 Rate (%)" threshold="80 ms Browser Redirect Window" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Uncommitted Transaction" Red Herring — compare Primary vs Replica timestamps!
psql -h postgres-primary -U principal -d orders -c "SELECT pg_current_wal_lsn();"
psql -h postgres-replica2 -U principal -d orders -c "SELECT pg_last_wal_replay_lsn(), NOW() - pg_last_xact_replay_timestamp() AS lag;"
# Output: lag = 00:00:00.950 (Replica is 950ms behind Primary!)
```

### Observed Culprit Code Snippet
```csharp
// ❌ BLINDLY ROUTES ALL 'GET' REQUESTS TO ASYNC READ REPLICA (VIOLATES READ-YOUR-WRITES!):
public IDbConnection GetConnectionForRequest(HttpContext context)
{
    return HttpMethods.IsGet(context.Request.Method)
        ? new SqlConnection(_readReplicaConnString) // ❌ Stale for 950ms after POST/PUT!
        : new SqlConnection(_primaryWriteConnString);
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does blind `GET -> Replica / POST -> Primary` routing violate Causal Read-Your-Writes consistency, and how do LSN / Write-Window Sticky Routing solve it cleanly? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Monotonic Reads & Read-Your-Writes Consistency Models
* **Eventual Consistency** is acceptable when User A views User B's product review 1 second late.
* **Read-Your-Writes (Causal Consistency)** is a hard invariant whenever User A mutates state (`POST /checkout`, `PUT /profile`) and immediately renders the resulting view: **a user must never travel backward in time relative to their own writes!**

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;

namespace PrincipalJourney.SystemDesign.WarRoom;

public sealed class CausalReadYourWritesConnectionRouter(
    IHttpContextAccessor httpContextAccessor,
    TimeProvider timeProvider,
    string primaryConnectionString,
    string readReplicaConnectionString)
{
    private const string LastWriteHeaderOrCookie = "X-Principal-Last-Write-Ticks";
    private static readonly TimeSpan CausalPinningWindow = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Call this inside UnitOfWork.CommitAsync() on any POST/PUT/PATCH/DELETE mutation.
    /// Stamps the caller's response with their mutation timestamp (or DB LSN).
    /// </summary>
    public void RecordMutationCommit()
    {
        var ctx = httpContextAccessor.HttpContext;
        if (ctx is null) return;

        string nowTicks = timeProvider.GetUtcNow().UtcTicks.ToString();
        ctx.Response.Cookies.Append(LastWriteHeaderOrCookie, nowTicks, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            MaxAge = CausalPinningWindow
        });
    }

    public IDbConnection CreateConnection()
    {
        var ctx = httpContextAccessor.HttpContext;
        if (ctx is null || !HttpMethods.IsGet(ctx.Request.Method))
        {
            return new SqlConnection(primaryConnectionString);
        }

        // If this user performed a write within the last 5 seconds, route their GET to PRIMARY!
        if (ctx.Request.Cookies.TryGetValue(LastWriteHeaderOrCookie, out var ticksStr) &&
            long.TryParse(ticksStr, out long lastWriteTicks))
        {
            var elapsedSinceWrite = timeProvider.GetUtcNow() - new DateTimeOffset(lastWriteTicks, TimeSpan.Zero);
            if (elapsedSinceWrite <= CausalPinningWindow)
            {
                return new SqlConnection(primaryConnectionString);
            }
        }

        // Safe passive read: route to Asynchronous Read Replica!
        return new SqlConnection(readReplicaConnectionString);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Blind `GET` -> Replica) | After (5s Causal Write-Window Pinning + Idempotency Key) | Validation & Rollback Procedure |
|---|---|---|---|
| **Post-Checkout `404` Rate** | `100%` when replica lag > `80ms` | **`0.00%`** (Pinned to Primary for `5s` post-write) | Integration test injects `2s` replica lag via Toxiproxy; assert `POST` -> `GET` returns `200 OK`. |
| **Passive Catalog Read Offload** | `100%` on Replica | **`96.4%` on Replica** (Only active mutators hit Primary for 5s) | Monitor Primary vs. Replica CPU ratio. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just return the full Order Confirmation DTO directly in the `POST /checkout` `201 Created` response body so the SPA doesn't even need to call `GET /orders/{id}`?"*

**The Principal Defense**:
> *"Returning the created representation in the `201 Created` response is great practice and eliminates the initial network hop! However, the moment the user hits **F5 (Browser Refresh)** on `/orders/99412/confirmation` 400 milliseconds later, or opens the link from their push notification, the browser fires `GET /orders/99412`! We do **both**: return the representation in `201 Created` AND enforce Causal Write-Window / LSN routing on `GET`."*

### Question 2 (The Second-Order Failure Mode):
> *"What if a disaster recovery lag event causes the Read Replica to fall `45 seconds` behind the Primary — longer than the `5-second` cookie window?"*

**The Principal Defense**:
> *"For strict causal guarantees regardless of lag duration, instead of a wall-clock timestamp cookie, stamp the cookie/header with the **Database Log Sequence Number (`pg_current_wal_lsn()` in Postgres / `min_active_rowversion()` in SQL Server)** at commit time! When a `GET` arrives, compare `@ClientMinLsn <= ReplicaCurrentLsn` (cached in memory every 200ms). If the replica has not yet replayed up to `@ClientMinLsn`, fail over that read to the Primary automatically!"*

### Question 3 (The FinOps / Cost Axis):
> *"To fix the 950ms replica lag, the vendor wants us to upgrade all 3 Read Replicas to Synchronous Commit mode across zones (`+$9,200/month` for Business Critical tier + `+3ms` write latency on every transaction). Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Turning 3 read-scale replicas into Synchronous Commit nodes slows down every write on the Primary waiting for 3 quorum ACKs and costs $9,200/month! With **Causal LSN / 5-Second Write-Window Routing** ($0/month), `96%` of catalog browsing reads stay on cheap Asynchronous Replicas while post-mutation reads get `100%` strong consistency from the Primary."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1002 — Read-Replica Lag Double-Payment Bug

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 8 minutes | **Mitigation Latency (TTM)**: 15 minutes

## Five Whys Root Cause Chain
1. **Why were 1,420 customers charged twice?** -> They saw "Order Not Found" on the confirmation screen and re-submitted checkout.
2. **Why did `GET /orders/{id}` return 404 after `POST /checkout` succeeded?** -> `GET` routed to Read Replica #2, which was 950ms behind Primary.
3. **Why did `GET /orders/{id}` route to a lagging replica?** -> Middleware blindly routed all `GET` requests to replicas without checking recent user mutations.
4. **Why did the second click charge the card again?** -> The frontend generated a *new* `Idempotency-Key` when the confirmation page returned `404`.
5. **Why did the frontend dev suspect uncommitted SQL transactions?** -> They were unaware that `GET` and `POST` hit different physical database servers.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Deploy `CausalReadYourWritesConnectionRouter` (5s cookie + LSN check) | Order Team | Chaos test with 5s simulated replica lag passes E2E |
| P0 | Bind `Idempotency-Key` to `CartId + CartVersion` instead of random UUID per click | Frontend Team | E2E retry test asserts identical `Idempotency-Key` on re-submit |
```
