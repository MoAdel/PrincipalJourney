# 14 — Principal DevOps & Delivery Interview Scenarios

---

## Scenario 1: Zero-Downtime Database Schema + Code Rollout in Kubernetes
**Prompt**: *"You have 40 pods of `OrderService` v1 running in production. You are deploying v2, which renames column `CustomerAddress` to `ShippingAddress` in SQL Server. How do you design the CI/CD pipeline and rollout so zero requests fail during deployment OR if v2 has to be rolled back 20 minutes later?"*

### Principal Architectural Solution:
1. **Never Run Destructive DDL Inside Pod Startup (`DbContext.Database.Migrate()`)**:
   - Running migrations on `Program.cs` startup across 40 booting pods creates a race condition and couples code rollback to irreversible schema changes.
2. **Enforce the 4-Release Expand/Contract Protocol**:
   - **Release 1 (Schema Expand)**: Pipeline applies additive, non-locking SQL DDL: adds nullable `ShippingAddress` column. v1 pods ignore it (ensure `SELECT` queries list explicit columns, never `SELECT *`).
   - **Release 2 (Dual-Write Code Rollout)**: Deploy v2 pods via Canary rollout. v2 writes to *both* `CustomerAddress` and `ShippingAddress`, still reading from `CustomerAddress` (with fallback). **Rollback safety**: If v2 crashes at 25% canary weight, rolling back to v1 loses zero data because `CustomerAddress` was continuously populated!
   - **Release 3 (Chunked Backfill & Read Cutover)**: Run a throttled background job backfilling historical rows (`TOP (5000)` batches to avoid lock escalation >= 5,000 locks). Switch reads to `ShippingAddress`.
   - **Release 4 (Contract)**: Only after v2 has been stable in production for the full rollback window (e.g., 7 days), deploy the contract migration dropping `CustomerAddress`.

---

## Scenario 2: Securing Multi-Tenant CI/CD Pipelines Against Secret Exfiltration
**Prompt**: *"A developer opens a Pull Request from a forked repository or feature branch that modifies `.github/workflows/ci.yml` to `curl` environment variables to an external webhook. How does your pipeline architecture prevent production secret leakage?"*

### Principal Architectural Solution:
1. **`pull_request` vs. `pull_request_target` Isolation**: Never run untrusted PR code under `pull_request_target` with access to repository secrets.
2. **GitHub Environments with Required Reviewers & Branch Protection**: Scope production OIDC federation subjects (`sub: repo:org/repo:environment:production`) strictly to the `production` environment, which can only be entered from protected `main` branch refs after status checks pass.
3. **Egress Network Filtering (StepSecurity Harden-Runner)**: Attach an eBPF network monitor to CI runners that whitelists outbound DNS/TCP connections strictly to `api.nuget.org`, `mcr.microsoft.com`, and the internal ACR endpoint, blocking arbitrary outbound exfiltration calls.
