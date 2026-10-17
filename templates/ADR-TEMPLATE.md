# ADR-NNN: <Short Actionable Decision Title>

- **Status**: `Accepted` | `Proposed` | `Superseded`
- **Date**: `2026-XX-XX`
- **Deciders**: Principal Architecture Group, Staff SRE, Product Engineering Leads
- **Technical Domain**: `<Compute / Storage / Identity / Data / Messaging / AI>`

---

## 1. Context & Problem Statement
<Describe the concrete architectural forces, scale targets, SLA constraints, and hardware/financial realities. Never state requirements without quantitative boundaries.>

> 📐 **Derive It (Capacity & Financial Envelope)**
> - **Peak Throughput**: `<X> RPS`
> - **Data Growth**: `<Y> GB/day` ($\approx <Z>\text{ TB/year}$)
> - **Latency Ceiling**: `p99 < <W> ms`
> - **Unit Cost Ceiling**: `$<C>` per million transactions

---

## 2. Considered Options & Trade-Off Matrix

| Evaluation Axis | Option 1: <Chosen Design> | Option 2: <80%-Good Low-Cost Alternative> | Option 3: <Status Quo / Over-Engineered> |
|---|---|---|---|
| **p99 Latency** | `<X ms>` | `<Y ms>` | `<Z ms>` |
| **Monthly Infra Cost** | `$<A>/mo` | `$<B>/mo` | `$<C>/mo` |
| **Operational Complexity** | `Low / Medium / High` | `Low` | `High` |
| **Failure Blast Radius** | `<Contained to shard>` | `<Single region>` | `<Global cascading>` |
| **Validation & Rollback** | `<How validated in prod & exact rollback step>` | `<Validation & rollback>` | `<Validation & rollback>` |

---

## 3. Decision & Mechanical Rationale
We choose **Option 1** (or **Option 2** until scale threshold `<N>` is crossed) because:
1. **Mechanical Sympathy**: <Why it aligns with OS/runtime/storage physics>
2. **Failure Containment**: <How it degrades gracefully under partition or dependency death>
3. **FinOps Unit Economics**: <Why the cost-per-transaction is optimal at current scale>

---

## 4. Invalidation Criteria (When to Revisit)
This decision MUST be revisited if any of the following thresholds are breached:
1. Sustained write throughput exceeds `<X> RPS` for 7 consecutive days.
2. Monthly infrastructure spend on `<Component>` exceeds `$<Y>/month`.
3. Cross-region replication lag exceeds `<Z> seconds` at `p99`.

---

## 5. Automated Governance Enforcement
```csharp
// NetArchTest or CI policy test enforcing this ADR automatically
```
