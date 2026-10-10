# Principal Frontend Architecture & Reactive Systems Competency Matrix

> "A Junior Developer builds web pages that work when one user clicks one button.
>
> A Principal Engineer designs reactive stream architectures, memory-leak-proof component lifecycles, and sub-16ms change detection pipelines that withstand complex enterprise workflows without stutter or crash."

---

## 1. The 5-Level Frontend Architecture Mastery Matrix

```text
┌───────┬───────────────────────────┬─────────────────────────────────────────────────────────────┐
│ Level │ Title                     │ Architectural Capabilities                                  │
├───────┼───────────────────────────┼─────────────────────────────────────────────────────────────┤
│ L1    │ UI Builder                │ Writes basic HTML/CSS/JS, consumes component libraries.     │
│ L2    │ Component Developer       │ Builds stateful components, uses basic hooks / templates.   │
│ L3    │ Reactive UI Engineer      │ Masters RxJS operators, implements HTTP interceptors.       │
│ L4    │ Staff Frontend Architect  │ Custom decorators, structural directives, OnPush tuning.    │
│ L5    │ Principal Web Strategist  │ Virtual DOM Fiber diffing, memory leak profiling, cross-app │
│       │                           │ micro-frontend architecture, zero-jank 60 FPS performance.  │
└───────┴───────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Competency Pillars

### Pillar 1: Advanced Reactive Programming (RxJS)
- **Stream Transformation Operators**: `map`, `filter`, `mergeMap`, `switchMap`, `concatMap`, `exhaustMap`.
- **Subscription Lifecycle & Memory Leak Elimination**: `takeUntilDestroyed()`, `takeUntil()`, Async Pipe, and subscription pooling.
- **Subject Specialization**: `Subject`, `BehaviorSubject` (state caching), `ReplaySubject` (history replay), and `AsyncSubject`.
- **Backpressure & Resiliency**: `debounceTime`, `throttleTime`, `distinctUntilChanged`, `catchError`, and exponential retry strategies.

### Pillar 2: TypeScript Decorators & Meta-Programming
- **Decorator Flavors**: Class, method, property, and parameter decorators (TC39 Stage 3 standard).
- **Enterprise Use Cases**: Authoring custom decorators for execution timing (`@LogPerformance`), caching (`@Memoize`), and authorization (`@RequireRole`).

### Pillar 3: Advanced Component Architecture
- **Component Lifecycle Hooks**: Mounting, rendering, updating, cleanup (`ngOnInit`/`ngOnDestroy`, `useEffect`/`useLayoutEffect`).
- **Composition Patterns**: Render props, Higher-Order Components (HOCs), Compound Components, and Slot projection.
- **Framework Portability**: Clean separation of presentation from state stores (Zustand / Redux / NgRx / Signals).

### Pillar 4: HTTP Interceptors & Cross-Cutting Concerns
- **Interceptor Chains**: Request transformation (Bearer token injection, correlation ID headers) and Response transformation.
- **Token Refresh Queueing**: Mutex-protected refresh token coordination preventing request storms.
- **Global Error Governance**: RFC 7807 `ProblemDetails` toast mapping and automatic network retry with backoff.

### Pillar 5: Custom Directives & DOM Safety
- **Structural vs Attribute Directives**: Conditionally mutating DOM trees (`*appHasRole`) vs modifying element behavior.
- **Safe DOM Manipulation**: Using Angular `Renderer2` or React Refs without direct global `document` manipulation (preventing XSS and SSR hydration bugs).

### Pillar 6: Change Detection & Reconciliation
- **Angular Change Detection**: `Default` tree checking vs `ChangeDetectionStrategy.OnPush` and zoneless Signals.
- **React Virtual DOM Reconciliation**: Fiber tree diffing, reconciliation heuristics, key-prop identity, and memoization (`React.memo`, `useMemo`).
- **Performance Profiling**: Identifying unneeded re-render cascades using Chrome DevTools Performance Profiler and React DevTools.
