# Incident 01: The Out-of-Order `mergeMap` Search Race & Zombie Subscription Leak

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Enterprise Financial Trading SPA (Angular 19 / RxJS 7.8)  
> **Business Impact**: Traders switching rapidly between `"USD High-Yield"` and `"EUR Gov Bonds"` saw USD prices rendered under the EUR bond header, executing 14 mispriced trades ($89,000 slippage loss) + Browser Tab OOM after 40 minutes  
> **Competencies Mastered**: Higher-Order RxJS Operators (`mergeMap` vs. `switchMap` vs. `exhaustMap` vs. `concatMap`), `AbortController` In-Flight HTTP Cancellation, `takeUntilDestroyed` Memory Leak Prevention

---

## 🚨 1. The 09:35 AM Crisis Briefing

Ten minutes after the European market open, the trading desk reported two critical failures on the Portfolio Blotter screen:
1. Clicking Portfolio `"USD-Corp"` (slow `850ms` query) and immediately clicking `"EUR-Sovereign"` (fast `90ms` cached query) caused the UI to flash `"EUR-Sovereign"` for half a second and then **overwrite the table with `"USD-Corp"` rows while the header still said `"EUR-Sovereign"`**!
2. Traders' Chrome tabs grew to `3.8 GB` RAM and crashed with `Aw, Snap! Out of Memory` after switching views 30 times!

```text
[09:35:10] Trading Desk P0: UI displaying stale Account A positions under Account B header!
[09:35:25] RED HERRING: Backend Lead says "Redis or SQL must be returning the wrong portfolio ID!"
[09:36:05] Chrome DevTools Memory Snapshot: 30 detached BlotterComponent instances held alive by active WebSocket Subject subscriptions!
```

> 📐 **Derive It (Fermi Mode): Out-of-Order Network Resolution & Retained DOM Heap Leak**
> - **Inputs**: `SlowQueryMs = 850`, `FastQueryMs = 90`, `UserSwitchIntervalMs = 250`, `RetainedComponentHeapMB = 95`, `NavigationsCount = 35`
> - **Formula**: `ArrivalDeltaMs = (UserSwitchIntervalMs + FastQueryMs) - SlowQueryMs`
> - **Step-by-Step**:
>   1. **Race Condition Math**: At `T+0ms`, user clicks Portfolio A (`SlowQueryMs = 850ms` $ightarrow$ resolves at `T+850ms`). At `T+250ms`, user clicks Portfolio B (`FastQueryMs = 90ms` $ightarrow$ resolves at $250 + 90 = 	ext{T+340ms}$).
>   2. Because the component used `mergeMap`, Request A was **not cancelled** at `T+250ms`! Request B rendered at `T+340ms`, and `510ms` later at `T+850ms`, stale Request A resolved and overwrote the UI state!
>   3. **Memory Leak Math**: Each `BlotterComponent` held a `95 MB` OrderBook grid array and subscribed to a singleton `priceFeed$` hot `Subject` without `takeUntilDestroyed()`. Navigating 35 times retained $35 	imes 95	ext{ MB} = 3,325	ext{ MB}$ (`3.32 GB`) in V8 heap $ightarrow$ Chrome tab OOM crash!
> - **What-If Sensitivity**: Switching `mergeMap` to **`switchMap`** immediately triggers `AbortController.abort()` on Request A at `T+250ms` (`0%` stale overwrites), and adding **`takeUntilDestroyed()`** keeps retained memory flat at **`95 MB`** across infinite navigations!

<!-- TELEMETRY_WIDGET: title="Out-of-Order mergeMap Race & V8 Heap Leak" metric1="Browser Tab V8 Heap (MB)" metric2="Stale State Overwrites" threshold="1024 MB Safe Tab Heap Budget" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Backend Returning Wrong Data" Red Herring — inspect Chrome Network Waterfall!
# Request 1: GET /api/portfolio/USD-Corp (Started: 0ms, Finished: 850ms, Status: 200 OK - NOT CANCELLED!)
# Request 2: GET /api/portfolio/EUR-Sov  (Started: 250ms, Finished: 340ms, Status: 200 OK)

# Step 2: Automated Playwright / Vitest Marble Test to reproduce out-of-order emission
npx vitest run src/app/blotter/blotter.race.spec.ts
```

### Observed Culprit TypeScript Code
```typescript
// ❌ CATASTROPHIC DOUBLE BUG: mergeMap (No Cancellation) + Unbounded Subscription (Memory Leak)!
export class BlotterComponent implements OnInit {
  ngOnInit(): void {
    this.selectedPortfolioId$.pipe(
      // ❌ BUG 1: mergeMap runs all inner HTTP calls in parallel; slower older call overwrites newer call!
      mergeMap(portfolioId => this.http.get<Position[]>(`/api/portfolios/${portfolioId}`))
    ).subscribe(positions => {
      // ❌ BUG 2: No takeUntilDestroyed()! Long-lived Subject holds 'this' (95MB grid) in memory forever!
      this.positions = positions;
    });
  }
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does a global `Subject` retain destroyed components in the V8 garbage collector (`closure -> this`), and when must you use `switchMap` vs. `exhaustMap` vs. `concatMap`? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why V8 Garbage Collector Cannot Collect Un-Unsubscribed Components
* When `priceFeed$.subscribe(data => this.update(data))` runs on a singleton service `Subject`, the `Subject`'s internal `observers[]` array stores a strong reference to the `Subscriber` closure, which holds a strong reference to `this` (`BlotterComponent`) and its entire detached DOM/data tree!
* When the router destroys `BlotterComponent`, the component is removed from the DOM, **but remains reachable from the GC Root (`window -> injector -> PriceFeedService -> observers[] -> closure -> BlotterComponent`)**!

### 2. The 4 Higher-Order RxJS Operators Law
* **`switchMap` (Read Queries / Search / Filter)**: Cancels in-flight inner observable (`XHR.abort()`) when a new outer event arrives.
* **`exhaustMap` (Login / Submit / Pay Buttons)**: Ignores new outer clicks completely until the current in-flight HTTP call finishes!
* **`concatMap` (Sequential Ordered Writes)**: Queues outer events strictly in FIFO order (`1 -> 2 -> 3`).
* **`mergeMap` (Independent Parallel Writes/Tasks)**: Executes concurrently in arbitrary completion order (NEVER use for state-replacing reads!).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```typescript
import { Component, ChangeDetectionStrategy, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, exhaustMap } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-trading-blotter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`
})
export class ResilientBlotterComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedPortfolioId$ = new Subject<string>();
  readonly executeTradeClick$ = new Subject<TradeOrderDto>();
  readonly positions = signal<Position[]>([]);

  constructor() {
    // 1. READ PATH: switchMap automatically aborts stale in-flight HTTP GETs via AbortController!
    //    takeUntilDestroyed() automatically unsubscribes when component is destroyed!
    this.selectedPortfolioId$.pipe(
      switchMap(id => this.http.get<Position[]>(`/api/portfolios/${id}`)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(freshPositions => {
      this.positions.set(freshPositions);
    });

    // 2. WRITE PATH (Execute Trade Button): exhaustMap ignores rapid double-clicks while trade is in flight!
    this.executeTradeClick$.pipe(
      exhaustMap(order => this.http.post<TradeReceipt>(`/api/trades`, order)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`mergeMap` + Raw `subscribe`) | After (`switchMap` + `exhaustMap` + `takeUntilDestroyed`) | Validation & Rollback Procedure |
|---|---|---|---|
| **Out-of-Order Stale Read Overwrites** | `100%` when Request 1 > Request 2 latency | **`0.0%`** (Stale Request 1 aborted immediately) | RxJS Marble Test (`TestScheduler`) verifies `"a---b"` cancels `"a"`'s inner stream. |
| **Tab Memory After 50 Route Navigations** | `3,800 MB` (Tab OOM Crash) | **`98 MB`** (`0` detached component instances) | Playwright heap snapshot test asserts `Detached BlotterComponent == 0`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"When the browser aborts Request A via `switchMap`, does that automatically roll back a database query or mutation that already started on the ASP.NET Core server?"*

**The Principal Defense**:
> *"Only if the ASP.NET Core endpoint **propagates `HttpContext.RequestAborted` (`CancellationToken ct`)** down into EF Core / Dapper (`ToListAsync(ct)`)! When `switchMap` unsubscribes, the browser closes/resets the HTTP stream, which fires `HttpContext.RequestAborted` on Kestrel. That is why every `GET` controller action on our backend MUST accept `CancellationToken ct` so an aborted frontend search immediately cancels the expensive SQL query on the database server too!"*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if an unhandled HTTP 500 error occurs inside the inner `this.http.get(...)` stream inside `switchMap`?"*

**The Principal Defense**:
> *"In RxJS, an unhandled error inside `switchMap`'s inner observable **terminates the outer stream permanently**! The next time the user clicks another portfolio filter, the stream is dead and nothing happens! You must ALWAYS place `catchError(...)` **inside** the inner `switchMap` pipe (`switchMap(id => this.http.get(...).pipe(catchError(...)))`) so the outer click stream stays alive forever!"*

### Question 3 (The FinOps / Cost Axis):
> *"Users typing in the 'Search Securities' autocomplete box fire an HTTP request on every keystroke (`12 keystrokes/word`), generating 4,000 RPS on our Elasticsearch cluster ($5,200/month). Defend the 80%-good frontend fix at $0 cost."*

**The Principal Defense**:
> *"Before scaling Elasticsearch, apply the canonical 3-operator RxJS search filter before `switchMap`: `debounceTime(250)`, `distinctUntilChanged()`, and `filter(q => q.length >= 2)`. Waiting `250ms` for typing pauses and ignoring duplicate strings cuts backend search RPS by **86%** (`4,000 RPS -> 560 RPS`), saving **$4,100/month** in search cluster compute with 3 lines of code!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1302 — Out-of-Order mergeMap Race & Subscription Leak

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 6 minutes | **Mitigation Latency (TTM)**: 18 minutes

## Five Whys Root Cause Chain
1. **Why did traders see USD positions under the EUR header?** -> A slow USD HTTP response resolved *after* a fast EUR HTTP response and overwrote the signal/array.
2. **Why wasn't the slow USD HTTP request cancelled when the user clicked EUR?** -> The stream used `mergeMap` instead of `switchMap`.
3. **Why did Chrome tabs crash after 40 minutes?** -> 35 destroyed `BlotterComponent` instances were retained in V8 memory.
4. **Why weren't destroyed components garbage-collected?** -> Subscription to singleton `Subject` lacked `takeUntilDestroyed()`.
5. **Why didn't ESLint catch the missing unsubscribe?** -> `eslint-plugin-rxjs-angular` (`prefer-takeuntil`) was not enabled in CI.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Replace `mergeMap` on queries with `switchMap` + inner `catchError` + `takeUntilDestroyed` | Frontend Team | RxJS Marble unit test added |
| P1 | Enable `eslint-plugin-rxjs` rules banning raw `mergeMap` on GET services and un-piped `subscribe()` | Frontend Arch | Enforced in PR CI check |
```
