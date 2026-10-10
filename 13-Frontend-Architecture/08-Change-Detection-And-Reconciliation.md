# Change Detection & Reconciliation: 60 FPS Performance Optimization

> "A slow user interface is rarely caused by slow networks.
>
> It is caused by unconstrained change detection algorithms evaluating thousands of unchanged DOM elements on every mouse movement."

---

## 1. Angular Change Detection: `Default` vs `OnPush` & Signals

```text
┌─────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│ Strategy                        │ Default Change Detection         │ ChangeDetectionStrategy.OnPush  │
├─────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ Evaluation Trigger              │ Any microtask, timer, click, I/O │ Explicit inputs / Signals only  │
│ Tree Traversal                  │ Checks EVERY component top-down  │ Skips entire component subtrees │
│ Cost at 2,000 Components        │ ~35 ms per keystroke (JANK!)     │ ~0.4 ms per keystroke (60 FPS)  │
│ Immutable Data Requirement      │ No (Mutates references in place) │ Yes (Requires new object refs)  │
└─────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

### The `OnPush` Invariant:
When an Angular component declares `@Component({ changeDetection: ChangeDetectionStrategy.OnPush })`:
- Angular **completely skips checking this component and its children** unless:
  1. An `@Input()` reference physically changes (`prevRef !== currentRef`).
  2. An event originates from inside the component template.
  3. A Signal read inside the template updates.
  4. An Async Pipe (`| async`) emits a new value.

---

## 2. React Virtual DOM Reconciliation: The Fiber Diffing Heuristics

React does not compare the real DOM; it compares the in-memory **Virtual DOM Fiber Tree**.

### The $O(N)$ Heuristic Rules:
1. **Different Element Types**: Changing from `<div>` to `<section>` immediately destroys the entire subtree and remounts from scratch.
2. **Key Prop Identity**: React uses the `key` prop to identify items across list re-renders:
   - ⚠️ **Anti-Pattern**: `key={index}` causes massive state bugs when items are sorted or deleted.
   - ✅ **Invariant**: Always use stable, unique business IDs: `key={order.id}`.

### Memoization Guards: `React.memo`, `useMemo`, `useCallback`
```typescript
// 1. Prevent child re-rendering if props have not changed
export const OrderRow = React.memo(function OrderRow({ order, onSelect }: OrderRowProps) {
  return <tr onClick={() => onSelect(order.id)}><td>{order.title}</td></tr>;
});

// 2. Parent MUST stabilize callback reference to prevent breaking React.memo:
export function OrderTable({ orders }: { orders: Order[] }) {
  // useCallback guarantees onSelect reference remains identical across renders!
  const handleSelect = useCallback((id: string) => {
    console.log('Selected:', id);
  }, []);

  return (
    <table>
      {orders.map(o => <OrderRow key={o.id} order={o} onSelect={handleSelect} />)}
    </table>
  );
}
```
