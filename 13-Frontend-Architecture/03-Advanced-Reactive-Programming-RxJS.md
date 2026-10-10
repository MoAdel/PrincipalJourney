# Advanced Reactive Programming with RxJS: Operators, Subjects & Memory Leaks

> "An Observable is a lazy, push-based data stream that delivers multiple values over time.
>
> If you treat Observables like Promises, you will trigger race conditions with switchMap, leak memory with uncollected subscriptions, and freeze user interfaces."

---

## 1. The Core Flattening Operators: When to Use Which

A Principal Engineer never guesses between `switchMap`, `mergeMap`, `concatMap`, and `exhaustMap`:

```text
┌──────────────┬────────────────────────────────────────────┬──────────────────────────────────────┐
│ Operator     │ Internal Behavior                          │ Best Production Use Case             │
├──────────────┼────────────────────────────────────────────┼──────────────────────────────────────┤
│ switchMap    │ Cancels prior in-flight inner observable   │ Search autocompletes, tab switches,  │
│              │ whenever a new source value arrives.       │ page changes (only latest matters).  │
├──────────────┼────────────────────────────────────────────┼──────────────────────────────────────┤
│ mergeMap     │ Concurrently executes all inner streams;   │ Parallel background uploads,         │
│              │ order of results is non-deterministic.     │ independent item data fetches.       │
├──────────────┼────────────────────────────────────────────┼──────────────────────────────────────┤
│ concatMap    │ Queues subsequent inner streams in strict  │ Transactional sequential operations, │
│              │ sequential order (FIFO execution).         │ queued chat messages, DB writes.     │
├──────────────┼────────────────────────────────────────────┼──────────────────────────────────────┤
│ exhaustMap   │ Ignores new incoming values while current  │ Login button clicks, payment submit, │
│              │ inner stream is actively running!          │ preventing duplicate form posts.     │
└──────────────┴────────────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Subjects Deep Dive: Choosing the Correct Stream Primitive

```typescript
// 1. Subject: Multicast event bus with ZERO memory (late subscribers miss past values)
const eventBus$ = new Subject<UserEvent>();

// 2. BehaviorSubject: Requires initial value; caches LATEST value for immediate delivery
const currentUser$ = new BehaviorSubject<UserProfile | null>(null);
currentUser$.next({ id: '42', name: 'Alex' });
currentUser$.subscribe(user => console.log('Current user:', user)); // Receives 'Alex' immediately!

// 3. ReplaySubject: Caches the last N values (or values within a time buffer)
const notificationHistory$ = new ReplaySubject<Notification>(5); // Replays last 5 notifications
```

---

## 3. The Number One Cause of Frontend Outages: Unsubscribed Observables

Every `.subscribe()` call registers a closure in heap memory. If the component destroys but the subscription remains open, **the entire component instance and all attached DOM nodes are held in memory**, leaking gigabytes over time.

### The Modern Enterprise Solution: `takeUntilDestroyed`
In modern Angular (v16+):

```typescript
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StockTickerService } from './stock-ticker.service';

@Component({
  selector: 'app-inventory-ticker',
  template: `<div>Live Stock: {{ stock() }}</div>`
})
export class InventoryTickerComponent {
  private stockService = inject(StockTickerService);

  constructor() {
    this.stockService.streamLiveStock()
      .pipe(
        // Automatically unregisters and completes when component destroys!
        takeUntilDestroyed()
      )
      .subscribe(stockUpdate => {
        this.processUpdate(stockUpdate);
      });
  }
}
```

In React (custom cleanup hook):

```typescript
import { useEffect } from 'react';
import { Subject } from 'rxjs';

export function useRxSubscription<T>(observable$: Observable<T>, onNext: (val: T) => void) {
  useEffect(() => {
    const subscription = observable$.subscribe(onNext);
    // Mandatory cleanup on unmount:
    return () => subscription.unsubscribe();
  }, [observable$]);
}
```
