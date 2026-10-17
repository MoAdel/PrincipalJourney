# 12 — Production Incident Post-Mortem: The Unpinned Base Image & Silent Canary Promotion

> **Incident ID**: `INC-2026-1104` | **Severity**: `SEV-1` | **Duration**: `34 minutes`

---

## 1. Incident Summary & Fermi Impact Derivation

At `14:10 UTC`, a routine patch deployment rebuilt `payment-gateway-api` using `FROM mcr.microsoft.com/dotnet/aspnet:9.0` without an immutable `@sha256` digest pin. Upstream had published a new OS layer update 20 minutes prior that changed OpenSSL 3.x cipher suite defaults, breaking mutual TLS (mTLS) handshakes with a legacy acquiring bank.

> 📐 **Derive It (Fermi Mode): Failed Payment Volume & Revenue Impact**
> - **Inputs**: `CheckoutRPS = 85`, `LegacyBankTrafficShare = 0.35`, `OutageDurationSec = 2040`, `AvgTransactionUSD = 64`
> - **Formula**: `ImpactedVolumeUSD = CheckoutRPS * LegacyBankTrafficShare * OutageDurationSec * AvgTransactionUSD`
> - **Step-by-Step**:
>   1. Failed transactions per second: $85 \times 0.35 = 29.75\text{ tx/s}$.
>   2. Total failed transactions over $34\text{ minutes}$ ($2,040\text{ s}$): $29.75 \times 2,040 = 60,690\text{ failed payments}$.
>   3. Gross Merchandise Value (GMV) delayed/lost: $60,690 \times \$64 = \$3,884,160$ (after retry recovery of $78\%$, net lost revenue = $\$854,515$).
> - **What-If Sensitivity**: Had the canary analysis template segmented HTTP error rates *per downstream bank route* instead of global aggregate success rate ($99.1\%$ global vs $0\%$ on legacy bank), the rollout would have aborted at the `5%` canary weight ($T+180\text{s}$), capping blast radius at $\$3,760$!

---

## 2. Five Whys Root Cause Chain
1. **Why did 35% of card payments fail with `AuthenticationException`?** -> The container's OpenSSL 3.x configuration rejected the legacy bank's TLS 1.2 RSA-PSS signature parameter.
2. **Why did OpenSSL change when only a 2-line C# logging change was merged?** -> The `Dockerfile` used a floating tag (`aspnet:9.0`) instead of a pinned digest (`aspnet:9.0@sha256:...`).
3. **Why did Staging pass while Production failed?** -> Staging rebuilt the image 3 days earlier (cached old base layer), and the pipeline **rebuilt from source** for Production instead of promoting the Staging image digest!
4. **Why didn't the Canary analysis gate abort the deployment?** -> The Prometheus query aggregated success rate across all endpoints including `/healthz` and `/metrics` (which accounted for 70% of request volume), masking the 35% failure rate on `/v1/charge`!
5. **Why did rollback take 19 minutes?** -> Engineers triggered a full CI rebuild of the previous Git commit (which pulled the *same* new broken base image!) before realizing they needed to roll back to the previous registry image digest.

---

## 3. Corrective Actions & Validation Table

| Action Item | Technical Implementation | Validation & Rollback |
|---|---|---|
| **Build Once, Promote Digest** | Eliminated `docker build` from deploy stages; CI builds once and passes `@sha256` digest to ArgoCD. | CI linter rejects any workflow running `docker build` after the `build` stage. |
| **Pin Base Images by SHA256** | RenovateBot manages `FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble-chiseled@sha256:...` via tested PRs. | Hadolint rule `DL3006` + custom digest regex enforced in PR checks. |
| **Exclude Health Probes from Canary SLI** | Updated Prometheus `AnalysisTemplate` to filter `http_route!~"/health.*|/metrics"` and group by critical route. | Verified via synthetic fault injection on `/v1/charge` in staging. |
