# Sprint 13 Executive Summary & 10 Invariant Laws of Principal Frontend Architecture

---

## The 10 Invariant Laws of Principal Frontend Architecture

1. **The Law of Bounded Subscriptions**: A subscription without an explicit unsubscription boundary (`takeUntilDestroyed`) is an inevitable memory leak.
2. **The Law of the Right Operator**: Use `switchMap` for search and page changes; `exhaustMap` for payment submissions; `concatMap` for sequential transactions; `mergeMap` for parallel independent loads.
3. **The Law of Push Performance**: Default change detection is an anti-pattern in large applications; all production components must leverage `OnPush` or Signals.
4. **The Law of Immutable Inputs**: In `OnPush` architectures, never mutate object properties in place; always emit new immutable references to trigger change detection.
5. **The Law of Key Identity**: Never use array index as a list `key`; list keys must be stable, unique entity identifiers.
6. **The Law of Queued Refresh**: Never fire parallel refresh token requests on multiple 401 responses; always mutex-queue concurrent requests behind a single refresh stream.
7. **The Law of DOM Sandboxing**: Never use raw `document.getElementById` or direct DOM mutation; always manipulate elements safely via `Renderer2` or React Refs.
8. **The Law of Structural Security**: Do not hide sensitive UI elements with CSS `display: none`; remove unauthorized nodes from the DOM entirely using structural directives.
9. **The Law of Stabilized References**: When passing callback functions to memoized child components, always stabilize references with `useCallback` to prevent breaking memoization.
10. **The Law of 60 FPS Latency**: Total input-to-render pipeline latency must remain under 16 milliseconds to prevent visual frame drops (jank).
