# Production Hands-On Frontend Labs (5 Scenarios)

---

## Lab 1: Zero-Leak RxJS Autocomplete Search Stream
- **Objective**: Implement a search autocomplete input using `debounceTime(300)`, `distinctUntilChanged()`, `switchMap()`, and `takeUntilDestroyed()`.
- **Verification**: Simulate 1,000 rapid keystrokes; prove via Chrome DevTools that only 1 network request executes and 0 subscriptions remain after unmounting.

## Lab 2: Custom `@Memoize` Decorator
- **Objective**: Author a TypeScript method decorator caching return values based on stringified parameter arguments.
- **Verification**: Execute heavy matrix computations and prove subsequent calls execute in 0.01ms via cache hit.

## Lab 3: Mutex-Protected 401 Refresh Interceptor
- **Objective**: Build an HTTP interceptor that queues concurrent 401 requests and replays them after a single token refresh.
- **Verification**: Fire 20 parallel API calls with an expired token; verify that `/auth/refresh` is called exactly once.

## Lab 4: Role-Based Structural Security Directive
- **Objective**: Build an Angular `*appHasRole="['Admin', 'Auditor']"` directive (or React equivalent) removing unauthorized elements from the DOM.
- **Verification**: Inspect the DOM in DevTools; verify that hidden elements are completely removed, not merely set to `display: none`.

## Lab 5: Profiling & Eliminating Re-Render Cascades
- **Objective**: Refactor a laggy 5,000-row table from Default change detection to `OnPush` with memoized callbacks.
- **Verification**: Measure rendering latency before and after using React DevTools Profiler; prove reduction from 45ms to <2ms.
