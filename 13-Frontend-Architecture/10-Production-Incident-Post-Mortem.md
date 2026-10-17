# 10 — Production Incident Post-Mortem: The SSR Hydration Memory Leak & Interceptor DDoS

> **Incident ID**: `INC-2026-1301` | **Severity**: `SEV-1` | **Duration**: `28 minutes`

---

## 1. Incident Summary & Fermi Impact Derivation

At `09:00 UTC` during a flash sale, the Node.js Server-Side Rendering (SSR) tier began crashing with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` every 4 minutes. Simultaneously, the Identity Service experienced a $45\times$ spike in `/oauth/token` refresh calls.

> 📐 **Derive It (Fermi Mode): Per-Request Singleton RxJS Leak in SSR**
> - **Inputs**: `SSRRequestsPerSec = 150`, `LeakedSubjectGraphKB = 320`, `PodHeapLimitMB = 2048`
> - **Formula**: `TimeToOOMSec = (PodHeapLimitMB * 1024) / (SSRRequestsPerSec * LeakedSubjectGraphKB / 8)`
> - **Step-by-Step**:
>   1. A global `BehaviorSubject` singleton accumulated per-request user cart state during SSR rendering without completing on `DestroyRef`, leaking $320\text{ KB}$ of retained DOM/closure references per request across 8 SSR pods ($18.75\text{ RPS/pod}$).
>   2. Heap growth per pod: $18.75\text{ req/s} \times 320\text{ KB} = 6,000\text{ KB/s} \approx 5.86\text{ MB/s}$.
>   3. Time to exhaust $1,400\text{ MB}$ available V8 Old Space heap: $\frac{1,400\text{ MB}}{5.86\text{ MB/s}} = 238.9\text{ seconds}$ ($\approx 4.0\text{ minutes}$ between OOM crashes!).
> - **What-If Sensitivity**: On the client browser, simultaneously firing 12 dashboard widget API calls when an access token expired triggered 12 parallel `POST /oauth/token` requests per user because the HTTP interceptor lacked a shared single-flight refresh mutex!

---

## 2. Five Whys Root Cause Chain
1. **Why did SSR pods crash every 4 minutes?** -> V8 Old Space memory grew linearly at `5.86 MB/s` until OOM.
2. **Why wasn't request memory garbage-collected after HTML serialization?** -> A module-scoped cache map stored `Observable` subscriptions keyed by `sessionId` and never evicted them.
3. **Why did the Identity Service hit 100% CPU concurrently?** -> When SSR fell back to Client-Side Rendering (CSR), each browser tab booted 12 parallel HTTP requests; on `401 Unauthorized`, every failed request independently called `/oauth/token`.
4. **Why did the 2nd through 12th refresh calls fail and log the user out?** -> Refresh Token Rotation with Reuse Detection invalidated the token family as soon as the 2nd concurrent request presented the just-rotated refresh token!
5. **Why didn't unit tests catch it?** -> Interceptor unit tests mocked a single sequential `401` call, never testing 10 concurrent in-flight requests hitting `401` simultaneously.

---

## 3. Prevention & Validation Matrix

| Fix | Implementation | Validation & Rollback |
|---|---|---|
| **Eliminate Module-Scoped Mutable State in SSR** | Scoped all state providers to the DI request tree; banned module-level `new Subject()` via ESLint rule. | 1-hour k6 SSR soak test verifying flat V8 heap (`< 350MB`). |
| **Single-Flight Refresh Token Mutex** | Queued concurrent `401` requests behind a single `isRefreshing` lock + `BehaviorSubject<string | null>`. | Unit test firing 25 parallel `401` responses asserts `refreshToken()` is invoked exactly `1` time. |
