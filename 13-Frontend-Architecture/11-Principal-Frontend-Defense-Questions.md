# 11 — Principal Frontend Architecture Defense Questions

---

### Question 1: `switchMap` vs. `mergeMap` vs. `concatMap` vs. `exhaustMap` Race Conditions
> *"A financial trader clicks 'Filter Portfolio by Account A' and 100ms later clicks 'Account B'. Sometimes the UI renders Account A's balances under Account B's header. Why did this happen, and why can't you blindly use `switchMap` for every HTTP operation?"*

**Principal Defense**:
1. **Why the Race Condition Happened**: The developer used `mergeMap` (or raw `Promise.then()`). Request A took `600ms` (cold cache) while Request B took `120ms` (warm cache). Request B resolved at `T+220ms`, and Request A resolved later at `T+700ms`, overwriting fresher state!
2. **Why `switchMap` Fixes Reads**: `switchMap` automatically unsubscribes from the in-flight inner Observable (`AbortController.abort()` on the HTTP `fetch`/XHR) as soon as a new outer value arrives.
3. **Why Blindly Using `switchMap` on Writes Is Catastrophic**:
   - For **Queries (`GET`)**: Always use `switchMap` (latest intent wins, cancel stale).
   - For **Sequential Mutations (`POST/PUT` order items)**: Use `concatMap` so mutations execute strictly in FIFO order without canceling in-flight writes.
   - For **Form Submit / Payment Buttons**: Use `exhaustMap` so rapid double-clicks are completely ignored while the first submission is still in flight!

---

### Question 2: The Cost / Performance Defense Axis — Full SSR vs. Edge Static + Islands
> *"Marketing wants 100% Server-Side Rendering (SSR) on our entire enterprise portal for SEO and initial load speed, which will require 36 Node.js compute pods costing $4,200/month. Defend the 80%-good alternative at 10% of the cost."*

**Principal Defense**:
1. **Challenge the Premise**: Authenticated dashboard routes behind a login wall (`/app/portfolio`, `/app/settings`) are **never indexed by search engines**! Running dynamic Node.js SSR for authenticated views wastes $4,200/month in compute and introduces cross-request state leakage risks.
2. **The Hybrid Architecture ($380/month — 91% cheaper)**:
   - **Public Marketing & Product Catalog Pages (SEO-critical)**: Pre-render at build time or use Incremental Static Regeneration (ISR) cached at the CDN Edge (`Cache-Control: s-maxage=300, stale-while-revalidate=86400`). Cost: near zero compute, global `TTFB < 15ms`.
   - **Authenticated Enterprise Workspace**: Serve a static, edge-cached App Shell (`index.html` + immutable hashed JS chunks) with route-level lazy loading and `OnPush`/Signals reactivity.


---

## 💰 The FinOps & Unit-Economics Defense Axis (13-Frontend-Architecture)

### Question (The CFO / CTO Cost Challenge):
> *"This architecture is technically textbook, but we are killing it because the enterprise managed tier / over-provisioned footprint costs $15,000/month. Defend the 80%-good alternative at 20% of the cost, and state the exact quantitative threshold where upgrading becomes justified."*

**Principal Defense**:
1. **Unit-Economics First**: At early-to-mid scale (`< 1,500 RPS`), paying `$15,000/month` for dedicated multi-cluster licensing or 10x idle headroom violates unit economics (`Cost per 1M requests`).
2. **The 80%-Good Architecture at 20% Cost (`~$2,200/month`)**:
   - Replace network-chatty sidecars/clusters with in-process L1/L2 caching (`HybridCache`), bounded `System.Threading.Channels`, and modular monolith / shared-cluster partitioning with strict tenant/bulkhead quotas.
   - Apply tail-based sampling (`100%` errors, `1%` happy path) and topology-aware AZ routing to eliminate cross-AZ egress waste.
3. **Quantitative Upgrade Trigger (Invalidation Criteria)**:
   - We revisit and fund the `$15,000/month` tier only when sustained $p95$ load exceeds `8,000 RPS` for 14 consecutive days OR when contractual SLA downtime penalties exceed `$250,000/year`.

