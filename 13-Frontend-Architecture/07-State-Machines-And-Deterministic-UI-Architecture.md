# 07 — Deterministic UI State Machines, Optimistic Concurrency & Offline Sync

> "Boolean flags (`isLoading`, `isError`, `isSuccess`, `isRetrying`) create $2^4 = 16$ possible states when only 4 are valid. Impossible states in UI code are the #1 source of double-submits and corrupted client state."

---

## 1. Eliminating Impossible States with Discriminated Union State Machines

Replace loose boolean flags with an explicit Finite State Machine (FSM) using TypeScript Discriminated Unions:

```typescript
// ❌ ANTI-PATTERN: 2^4 = 16 states (What if isLoading === true && isError === true?)
interface BrokenCheckoutState {
  isLoading: boolean;
  isSubmitting: boolean;
  isError: boolean;
  isSuccess: boolean;
  errorMessage?: string;
  receiptId?: string;
}

// ✅ PRINCIPAL PATTERN: Exactly 5 mathematically valid states (Discriminated Union)
export type CheckoutFlowState =
  | { readonly status: 'IDLE'; readonly cartVersion: number }
  | { readonly status: 'VALIDATING_INVENTORY'; readonly idempotencyKey: string }
  | { readonly status: 'SUBMITTING_PAYMENT'; readonly idempotencyKey: string; readonly attempt: number }
  | { readonly status: 'SETTLED'; readonly receiptId: string; readonly settledAtIso: string }
  | { readonly status: 'FAILED'; readonly idempotencyKey: string; readonly reason: string; readonly retryable: boolean };

export type CheckoutEvent =
  | { type: 'CLICK_PAY'; idempotencyKey: string }
  | { type: 'INVENTORY_CONFIRMED' }
  | { type: 'PAYMENT_SUCCEEDED'; receiptId: string }
  | { type: 'PAYMENT_REJECTED'; reason: string; retryable: boolean }
  | { type: 'RESET' };

// Pure, deterministic transition function (100% unit-testable in <1ms without DOM)
export function transitionCheckout(state: CheckoutFlowState, event: CheckoutEvent): CheckoutFlowState {
  switch (state.status) {
    case 'IDLE':
      if (event.type === 'CLICK_PAY') {
        return { status: 'VALIDATING_INVENTORY', idempotencyKey: event.idempotencyKey };
      }
      return state; // Ignore double-clicks when not IDLE!

    case 'VALIDATING_INVENTORY':
      if (event.type === 'INVENTORY_CONFIRMED') {
        return { status: 'SUBMITTING_PAYMENT', idempotencyKey: state.idempotencyKey, attempt: 1 };
      }
      if (event.type === 'PAYMENT_REJECTED') {
        return { status: 'FAILED', idempotencyKey: state.idempotencyKey, reason: event.reason, retryable: event.retryable };
      }
      return state;

    case 'SUBMITTING_PAYMENT':
      if (event.type === 'PAYMENT_SUCCEEDED') {
        return { status: 'SETTLED', receiptId: event.receiptId, settledAtIso: new Date().toISOString() };
      }
      if (event.type === 'PAYMENT_REJECTED') {
        return { status: 'FAILED', idempotencyKey: state.idempotencyKey, reason: event.reason, retryable: event.retryable };
      }
      return state; // Ignore duplicate CLICK_PAY while payment is in flight!

    default:
      return state;
  }
}
```

---

## 2. Optimistic UI Updates with Deterministic Rollback

| Mutation Type | Use Optimistic UI? | Rollback Strategy on HTTP 4xx/5xx |
|---|---|---|
| **Idempotent Toggle / Reorder / Like** | **Yes** (`0ms` perceived latency) | Snapshot previous immutable state slice; restore snapshot and show non-blocking toast on error. |
| **Financial Transfer / Inventory Checkout** | **Never** (Must show explicit `SUBMITTING` state) | Keep same `Idempotency-Key` across retries so network drop never double-charges. |
