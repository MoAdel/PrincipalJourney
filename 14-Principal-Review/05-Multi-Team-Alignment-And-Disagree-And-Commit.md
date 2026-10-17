# 05 — The "Align-5-Teams" Strategy Doc & Disagree-and-Commit Protocol

> "The hardest problems at the Principal level are never purely technical. They happen when Team A owns the API Gateway, Team B owns Identity, Team C owns Checkout, Team D owns Legacy ERP, and nobody wants to fund the migration work on their Q3 roadmap."

---

## 1. Anatomy of an "Align-5-Teams" Cross-Org RFC

When driving an initiative across 5+ autonomous engineering teams, a standard technical spec fails because each Engineering Manager optimizes for their local OKRs. Use this 6-part structure:

```markdown
# Cross-Org RFC: Zero-Trust Token Exchange & Legacy Session Decommissioning

## 1. Executive Problem & Shared Pain (Quantified per Team)
- **Identity Team**: Spending 35% of sprint capacity maintaining legacy Redis session sync.
- **Checkout Team**: Losing $240k/quarter during Redis session failovers.
- **Mobile Team**: Blocked from launching biometric passkeys.

## 2. Non-Goals (Explicitly Scoped Out to Prevent Scope Creep)
- We are NOT replacing the legacy ERP database in this phase.
- We are NOT rewriting internal admin portals before Q4.

## 3. Contract Boundary & Zero-Coordination Adapter (The Decoupler)
- Platform Team provides a YARP Edge Token-Translation Sidecar so Checkout can migrate in Week 2 even if Legacy ERP doesn't migrate until Week 10!

## 4. Team-by-Team Effort & Dependency Matrix (T-Shirt Sized)
| Team | Required Change | Effort | Target Sprint | Unblocked By |
|---|---|---|---|---|
| Platform | Ship YARP Token-Translation Middleware | 5 days | Sprint 1 | None |
| Identity | Enable RFC 8693 Token Exchange endpoint | 3 days | Sprint 1 | None |
| Checkout | Switch `[Authorize]` policy to JWT claims | 2 days | Sprint 2 | Platform |
| Legacy ERP | Zero code changes (handled by Edge Sidecar) | 0 days | N/A | Platform |

## 5. Validation & Rollback Per Team
- Dual-header shadow mode validates 100% of requests for 14 days before removing legacy cookie.
```

---

## 2. Breaking Architectural Deadlocks: Disagree and Commit

When two Senior/Staff engineers deadlock for > 48 hours between **Option A** and **Option B**:

1. **Isolate the Crux Assumption**: Force both sides to state: *"What specific measurement or failure condition would prove my preferred design wrong?"*
2. **Classify Door Type (Jeff Bezos Type 1 vs. Type 2 Decisions)**:
   - **Type 2 (Two-Way Door / Reversible)**: Internal library choice, cache TTL strategy, module boundary inside a repo. **Rule**: Decide in `< 24 hours`, time-box a 2-week trial, and define the rollback metric.
   - **Type 1 (One-Way Door / Irreversible)**: Public API wire contract, multi-year database sharding key, cryptographic key hierarchy. **Rule**: Run a 48-hour Chaos/Load prototype, document in formal ADR, and secure ARB sign-off.
3. **Execute Disagree and Commit**: Once the data is gathered and the decision is recorded in the ADR, the dissenting party explicitly signs off on the ADR's **Invalidation Criteria** (e.g., *"We commit to Option A; if p99 exceeds 40ms at 5k RPS, we trigger the pre-agreed migration to Option B"*).
