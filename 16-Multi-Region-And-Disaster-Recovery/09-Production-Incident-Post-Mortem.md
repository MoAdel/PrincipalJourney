# 09 — Post-Mortem: The Asymmetric Standby Quota & Failover Collapse

> **Incident ID**: `INC-2026-1601` | **Severity**: `SEV-1` | **Duration**: `41 minutes`

---

## 1. Incident Summary & Fermi Derivation

When `East US` suffered a regional storage degradation, automated traffic routing shifted `12,000 RPS` to the `West US` disaster recovery region. Within 90 seconds, `West US` collapsed completely with `429 Too Many Requests` from Azure KeyVault and `OutOfMemory` on the AKS cluster because `West US` vCore cloud subscription quotas had never been raised to match `East US`'s 12 months of organic growth!

> 📐 **Derive It (Fermi Mode): Standby Cluster Auto-Scaler Quota Ceiling**
> - **Inputs**: `PeakTrafficRPS = 12000`, `RPSPerPod = 200`, `vCoresPerPod = 2`, `StandbyRegionSubscriptionQuotaCores = 64`
> - **Formula**: `RequiredFailoverCores = (PeakTrafficRPS / RPSPerPod) * vCoresPerPod`
> - **Step-by-Step**:
>   1. Pods required to serve `12,000 RPS`: $\frac{12,000}{200} = 60\text{ pods}$.
>   2. vCores required across the AKS node pool: $60 \times 2\text{ vCores} = 120\text{ vCores}$ (plus `16 vCores` for system daemonsets = $136\text{ vCores}$).
>   3. Because the `West US` cloud subscription still had the default regional quota of **`64 vCores`**, the Cluster Autoscaler failed at 28 pods with `QuotaExceeded`, forcing `12,000 RPS` onto 28 pods ($428\text{ RPS/pod}$ -> 100% CPU saturation and cascading timeouts)!
> - **What-If Sensitivity**: A simple daily Prometheus alert comparing `primary_region_allocated_cores > standby_region_quota_cores * 0.8` detects quota drift months before an outage occurs.

---

## 2. Corrective Actions & Validation Matrix

| Action Item | Implementation | Validation & Rollback |
|---|---|---|
| **Automated Regional Quota Parity Check** | Daily CI/SRE job queries `az vm list-usage` in both regions and alerts if DR quota < `125%` of Primary active usage. | Tested by lowering staging quota threshold; verified PagerDuty alert fires. |
| **Pre-Cached Secrets at Boot** | Eliminated runtime per-request KeyVault calls; secrets mounted via CSI Driver SecretProviderClass into memory-backed volume. | Simulated KeyVault blackout in chaos lab; running pods served 100% of traffic unaffected. |
