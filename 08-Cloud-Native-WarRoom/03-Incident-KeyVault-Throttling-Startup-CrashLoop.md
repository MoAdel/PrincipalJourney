# Incident 03: The 100-Pod KeyVault `429` Throttling Startup Cascade

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: AKS Cluster (100 Pods across 12 Microservices) / Azure Key Vault Standard  
> **Business Impact**: After a cluster node upgrade rebooted 100 pods simultaneously, Azure Key Vault throttled secret reads (`HTTP 429`), causing 78 pods to fail startup in `CrashLoopBackOff`  
> **Competencies Mastered**: Azure Key Vault Service Limits (`2,000 req / 10s` per vault), `AddAzureKeyVault` Per-Secret RPC Multiplier, Kubernetes Secrets Store CSI Driver (`SecretProviderClass`), Azure App Configuration KeyVault References

---

## 🚨 1. The 02:45 AM Crisis Briefing

During a routine AKS node OS image upgrade surge, 100 pods restarted within a 10-second window. Each pod called `builder.Configuration.AddAzureKeyVault()` on startup to load 45 secrets:

```text
[02:45:04] KeyVault Alert: Vault 'kv-prod-core' exceeded 2,000 operations / 10 seconds limit! Returning HTTP 429!
[02:45:12] RED HERRING: Cloud Admin suspects "Managed Identity token endpoint (IMDS 169.254.169.254) is broken on the new Ubuntu node image!"
[02:45:40] Cluster Alert: 78 crashing pods are immediately restarting and hammering KeyVault EVEN HARDER!
```

> 📐 **Derive It (Fermi Mode): `AddAzureKeyVault` N+1 Secret Fetch Multiplication**
> - **Inputs**: `RestartingPods = 100`, `SecretsInVault = 45`, `KeyVaultLimitPer10Sec = 2000`
> - **Formula**: `TotalVaultRpcsInBootWindow = RestartingPods * (1 + SecretsInVault)`
> - **Step-by-Step**:
>   1. In Azure Key Vault, the `GetSecrets` list API returns **only secret names/metadata**, NOT secret values!
>   2. Therefore, `AddAzureKeyVault()` executes `1` list call + **`45` individual `GetSecret(name)` HTTPS calls per pod** ($46\text{ RPCs/pod}$).
>   3. When `100` pods boot within 10 seconds: $100 \times 46 = 4,600\text{ KeyVault HTTPS operations}$ in `< 5 seconds`!
>   4. Azure Key Vault enforces a hard service ceiling of **`2,000` secret operations per 10 seconds per vault**. Over `2,600` calls fail with `HTTP 429 Too Many Requests`, crashing the pods on startup — and `kubelet` immediately restarts them, creating a self-sustaining **Startup Retry Storm**!
> - **What-If Sensitivity**: Grouping related config settings into a single JSON secret or mounting secrets via the **Kubernetes Secrets Store CSI Driver** (with node-level caching / K8s Secret sync) cuts KeyVault RPCs during a 100-pod reboot by **`95%`** (`4,600` $ightarrow$ `< 150` calls), and setting `ReloadInterval = TimeSpan.FromHours(1)` with jitter prevents synchronized runtime polling!

<!-- TELEMETRY_WIDGET: title="KeyVault 100-Pod Boot Throttling Storm" metric1="KeyVault RPCs / 10s" metric2="Crashing Pods in BackOff" threshold="2000 Ops / 10s Vault Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "IMDS Managed Identity" Red Herring — check KeyVault Diagnostic Logs for HTTP 429
az monitor metrics list --resource "$KEYVAULT_RESOURCE_ID"   --metric "ServiceApiResult" --filter "StatusCode eq '429'" --interval PT1M

# Step 2: Inspect pod crash logs for RequestFailedException: 429
kubectl logs -n prod -l app=order-api --previous | grep -E "429|TooManyRequests|SecretClient"
```

### Observed Culprit Code Snippet
```csharp
// ❌ LOADS ALL 45 INDIVIDUAL SECRETS SYNCHRONOUSLY ON EVERY POD BOOT & POLLS EVERY 30s!
builder.Configuration.AddAzureKeyVault(
    new Uri("https://kv-prod-core.vault.azure.net/"),
    new DefaultAzureCredential(),
    new AzureKeyVaultConfigurationOptions
    {
        ReloadInterval = TimeSpan.FromSeconds(30) // ❌ 100 pods * 46 calls * 2/min = 9,200 calls/min!
    });
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does loading 45 secrets from KeyVault require 46 HTTP requests per pod, why did `ReloadInterval = 30s` consume 75% of the vault's quota before the reboot even started, and how do CSI Driver / KeyVault Filtering solve this? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Every Microservice Was Loading Secrets It Didn't Even Own
* All 12 microservices pointed to a single shared `kv-prod-core` vault containing 45 secrets. Even though `OrderService` only needed **3 secrets**, `AddAzureKeyVault` defaults to downloading **all 45 secrets** in the vault!
* Worse, setting `ReloadInterval = 30s` across 100 pods meant the cluster was burning `1,533` operations every 10 seconds (`76%` of total vault capacity!) just polling unchanged secrets!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using Azure.Core;
using Azure.Extensions.AspNetCore.Configuration.Secrets;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.Configuration;

namespace PrincipalJourney.CloudNative.WarRoom;

public static class ResilientKeyVaultConfiguration
{
    public static IConfigurationBuilder AddScopedResilientKeyVault(
        this IConfigurationBuilder builder,
        Uri vaultUri,
        string servicePrefix)
    {
        var clientOptions = new SecretClientOptions
        {
            Retry =
            {
                Mode = RetryMode.Exponential,
                Delay = TimeSpan.FromSeconds(2),
                MaxDelay = TimeSpan.FromSeconds(30),
                MaxRetries = 5
            }
        };

        var secretClient = new SecretClient(vaultUri, new DefaultAzureCredential(), clientOptions);

        builder.AddAzureKeyVault(secretClient, new AzureKeyVaultConfigurationOptions
        {
            // 1. ONLY load secrets prefixed for this specific microservice (3 secrets instead of 45!)
            Manager = new PrefixFilteredSecretManager(servicePrefix),
            // 2. Refresh every 4 hours with random per-pod jitter (eliminates synchronized polling storms!)
            ReloadInterval = TimeSpan.FromHours(4) + TimeSpan.FromMinutes(Random.Shared.Next(1, 45))
        });

        return builder;
    }

    private sealed class PrefixFilteredSecretManager(string prefix) : KeyVaultSecretManager
    {
        public override bool Load(SecretProperties secret) =>
            secret.Name.StartsWith($"{prefix}--", StringComparison.OrdinalIgnoreCase) ||
            secret.Name.StartsWith("Shared--", StringComparison.OrdinalIgnoreCase);

        public override string GetKey(KeyVaultSecret secret) =>
            secret.Name[(secret.Name.IndexOf("--", StringComparison.Ordinal) + 2)..]
                  .Replace("--", ConfigurationPath.KeyDelimiter);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unfiltered Vault + 30s Poll) | After (Prefix Filter + 4h Jitter + Exponential Retry) | Validation & Rollback Procedure |
|---|---|---|---|
| **KeyVault Calls on 100-Pod Reboot** | `4,600 calls` (`HTTP 429` CrashLoop) | **`400 calls`** (`20%` of limit; 0 throttling) | Simulate `kubectl rollout restart` across all deployments in staging; assert `0` HTTP 429s. |
| **Background Polling Ops / 10s** | `1,533 ops / 10s` (`76%` quota burn) | **`0.25 ops / 10s`** (`0.01%` quota burn) | Alert if KeyVault saturation exceeds `40%` (`800 ops / 10s`). |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just export all KeyVault secrets into plain Kubernetes Secrets during the GitHub Actions CI deploy so pods never call KeyVault at runtime?"*

**The Principal Defense**:
> *"Copying secrets inside CI pipelines requires giving the CI runner read access to all production secrets and stores un-rotated static values in etcd. Instead, if we want zero pod startup dependency on KeyVault, we use the **Azure Key Vault Provider for Secrets Store CSI Driver**: the node-level CSI daemon fetches the secrets via Workload Identity and mounts them as an in-memory `tmpfs` volume (and optional encrypted K8s Secret). Even if KeyVault has a 10-minute outage during a pod restart, the mounted K8s Secret serves the pod immediately!"*

### Question 2 (The Second-Order Failure Mode):
> *"Why did we have 45 secrets in the first place? When we inspected the vault, 32 of them were URLs, feature flags, and timeout numbers!"*

**The Principal Defense**:
> *"Storing non-sensitive configuration (URLs, retry counts, feature flags) in an HSM-throttled cryptographic vault is a major anti-pattern! Non-sensitive config belongs in **Azure App Configuration / Kubernetes ConfigMaps**, while **Azure Key Vault** is reserved strictly for actual cryptographic material (connection strings, API keys, certificates) — reducing secret count per service from 45 to **2 or 3** (and `0` once SQL and Storage use passwordless **Managed Identity**!)."*

### Question 3 (The FinOps / Cost Axis):
> *"Wait — why do we even have SQL Server passwords, Redis passwords, and Blob Storage keys in Key Vault at all?"*

**The Principal Defense**:
> *"That is the ultimate Principal question! By migrating Azure SQL (`Authentication=Active Directory Workload Identity`), Azure Blob Storage (`DefaultAzureCredential`), Azure Service Bus, and Azure Cache for Redis to **Entra ID Workload Identity**, we eliminate **90% of secrets entirely**! A secret that does not exist cannot be leaked, never needs rotation, and consumes zero KeyVault quota."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0803 — 100-Pod KeyVault 429 Throttling Cascade

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 17 minutes

## Five Whys Root Cause Chain
1. **Why did 78 pods enter CrashLoopBackOff during node upgrade?** -> Startup threw `RequestFailedException (429 Too Many Requests)` from KeyVault.
2. **Why did KeyVault return 429?** -> Vault exceeded its hard limit of 2,000 operations per 10 seconds.
3. **Why did 100 pods generate 4,600 operations?** -> Every pod downloaded all 45 secrets in the shared vault (`1 List + 45 GetSecret`).
4. **Why was the vault already at 76% capacity before the reboot?** -> `ReloadInterval` was set to 30 seconds across 100 pods.
5. **Why were there 45 secrets in the vault?** -> Non-secret config values and avoidable SQL/Storage passwords were stored in KeyVault instead of ConfigMaps and Managed Identity.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Add `PrefixFilteredSecretManager` + `ReloadInterval = 4h` with jitter | Platform Team | Verified KeyVault ops dropped by 99.4% |
| P1 | Migrate SQL, Blob, and Service Bus from connection-string passwords to Workload Identity | All Teams | Zero connection passwords in KeyVault |
```
