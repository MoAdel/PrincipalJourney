# 03 — Enterprise DevOps, Delivery SLAs & DORA Requirements

> "Deployment velocity without automated failure containment is just an engine for shipping outages faster."

---

## 1. Elite DORA & Platform Engineering Targets

Every production service in our architecture must satisfy the following non-functional delivery invariants before receiving production ingress traffic:

| DORA / Platform Metric | Elite Target | Hard Ceiling / Gate | Validation & Rollback Procedure |
|---|---|---|---|
| **Deployment Frequency** | On-demand (multiple/day) | Min 2x/week per service | Automated Trunk-Based CI/CD; feature flags decouple deploy from release. |
| **Lead Time for Changes** | `< 35 minutes` (Commit -> Prod) | `< 2 hours` | Parallel matrix builds, remote NuGet/Docker BuildKit cache, zero manual CAB gates. |
| **Change Failure Rate (CFR)** | `< 2.0%` | `< 5.0%` | Automated canary analysis (Flagger / Argo Rollouts) halts rollout if HTTP 5xx > 0.5%. |
| **Mean Time to Restore (MTTR)** | `< 5 minutes` | `< 15 minutes` | Immutable digest rollback (`kubectl rollout undo` / Traffic Manager weight shift) in `< 45s`. |
| **Container Image Footprint** | `< 75 MB` (Chiseled .NET 9) | `< 150 MB` | CI fails if image exceeds 150MB or contains shell/root UID `0`. |

> 📐 **Derive It (Fermi Mode): Cold-Start Node Pull Latency during Auto-Scaling**
> - **Inputs**: `FatImageMB = 2400`, `ChiseledImageMB = 68`, `NodeNICBandwidthMbps = 1000`, `DecompressionFactor = 2.2`
> - **Formula**: `PullAndExtractSec = ((ImageMB * 8) / NodeNICBandwidthMbps) * DecompressionFactor`
> - **Step-by-Step**:
>   1. **Fat SDK Image (2,400 MB)**: Network transfer = $\frac{2,400 \times 8}{1,000} = 19.2\text{ s}$. With gzip tar extraction ($2.2\times$ CPU/disk penalty), node readiness takes $42.2\text{ seconds}$.
>   2. **Chiseled Runtime Image (68 MB)**: Network transfer = $\frac{68 \times 8}{1,000} = 0.54\text{ s}$. With zstd decompression, node readiness takes $1.19\text{ seconds}$ ($35\times$ faster scale-out during traffic spikes!).
> - **What-If Sensitivity**: If 40 AKS nodes scale up simultaneously from a single regional ACR Basic tier (capped at `1,000 Mbps` total registry egress), pulling a `2.4 GB` image saturates the registry for $40 \times 19.2\text{s} = 768\text{ seconds}$ ($12.8\text{ minutes}$), turning a traffic spike into a complete cluster outage.

---

## 2. Non-Negotiable Pipeline Security & Governance Gates

1. **Zero Long-Lived Cloud Credentials**: CI runners must authenticate to Azure/AWS/GCP exclusively via **OpenID Connect (OIDC) Federated Workload Identity** (`id-token: write`) with short-lived tokens (`<= 15m` TTL).
2. **Hermetic & Reproducible Builds**: Every `dotnet restore` must run with `--locked-mode` against a committed `packages.lock.json` file.
3. **Immutable Artifact Promotion**: You **never** rebuild source code per environment (`Dev` -> `Staging` -> `Prod`). You build **once** into an immutable OCI image digest (`sha256:...`), sign it with Cosign, and promote that exact digest across environments.
