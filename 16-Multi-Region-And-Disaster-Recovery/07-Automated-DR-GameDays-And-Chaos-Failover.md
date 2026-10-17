# 07 — Automated DR GameDays & Proving RTO in Production

> "An untested Disaster Recovery runbook in a Confluence wiki is a work of fiction. If you haven't failed over production in the last 90 days, your RTO is unknown."

---

## 1. The Automated Regional Evacuation Runbook (5-Step Execution)

```bash
# STEP 1: Verify Standby Region (us-west-2) Readiness & Replication Lag (< 2s)
az sql db replica list-links -g prod-rg -s sql-primary-east -n orders-db   --query "[].{Role:role, LagSec:replicationLagSeconds, State:replicationState}" -o table

# STEP 2: Pre-Scale Standby AKS Cluster & Warm Connection Pools BEFORE Shifting Traffic
kubectl --context=aks-us-west-2 scale deployment/order-api -n prod --replicas=40
kubectl --context=aks-us-west-2 wait --for=condition=Available deployment/order-api -n prod --timeout=60s

# STEP 3: Fence Primary Region (Revoke Write Lease & Drain Edge Weight to 0%)
az network front-door backend-pool backend update   --resource-group prod-rg --front-door-name fd-global   --pool-name api-pool --index 1 --enabled false

# STEP 4: Execute Planned Un-Lossy Database Geo-Failover (Synchronizes final WAL tail then flips roles)
az sql failover-group set-primary   --resource-group prod-rg-west --server sql-standby-west --name fg-orders-global

# STEP 5: Verify Synthetic Canary Transactions on New Primary
curl -fsS -X POST https://api.principal.io/v1/health/synthetic-write-probe
```

---

## 2. Quarterly DR GameDay Scorecard

| Drill Phase | Target SLA | Measured Actual | Pass/Fail Criteria |
|---|---|---|---|
| **1. Alert to Decision (TTD)** | `< 90 seconds` | `54 seconds` | Multi-window burn rate pages Incident Commander automatically. |
| **2. Standby Compute Scale-Up** | `< 60 seconds` | `38 seconds` | Chiseled `<70MB` images + pre-provisioned warm node pool. |
| **3. Planned DB Failover (`RPO = 0`)** | `< 45 seconds` | `29 seconds` | Zero orphaned transactions in reconciliation audit query. |
| **4. Failback to Primary Region** | `< 3 minutes` | `110 seconds` | Symmetrical script returns traffic to `us-east` without manual DB fixes. |
