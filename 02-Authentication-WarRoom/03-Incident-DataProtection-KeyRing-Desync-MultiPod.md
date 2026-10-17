# Incident 03: The Ephemeral Container DataProtection KeyRing Desync

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: AKS 30-Pod BFF (Backend-For-Frontend) Cluster / ASP.NET Core 9 Data Protection API  
> **Business Impact**: 96.6% (`29/30`) intermittent cookie decryption & CSRF antiforgery failures across every request not hitting the exact pod that issued the cookie  
> **Competencies Mastered**: ASP.NET Core `IDataProtectionProvider`, KeyRing Persistence (Blob Storage + KeyVault Envelope Encryption), Rolling Deployment Key Synchronization

---

## 🚨 1. The 04:30 AM Crisis Briefing

A new Backend-For-Frontend (BFF) service using encrypted Authentication Cookies and Antiforgery CSRF tokens passed all staging tests (which ran on `replicas: 1`). When scaled to `replicas: 30` in Production without sticky sessions:

```text
[04:30:15] BFF Alert: HTTP 400 (AntiforgeryValidationException) and HTTP 401 rate at 96.6%!
[04:30:40] RED HERRING: Network Engineer claims "The Azure Application Gateway ingress cookie affinity is corrupting HTTP headers!"
[04:31:10] Pod Logs: System.Security.Cryptography.CryptographicException: The key {8f4a2b1c-...} was not found in the key ring.
```

> 📐 **Derive It (Fermi Mode): Multi-Pod Ephemeral KeyRing Failure Probability**
> - **Inputs**: `PodReplicas = 30`, `PodsHoldingMatchingKey = 1`
> - **Formula**: `FailureProbability = 1 - (PodsHoldingMatchingKey / PodReplicas)`
> - **Step-by-Step**:
>   1. Without shared external persistence, each of the 30 container pods generated its own isolated DataProtection XML key in `/root/.aspnet/DataProtection-Keys` inside its ephemeral container filesystem!
>   2. A user logs in on Pod #1 (receiving a cookie encrypted with Pod #1's key `{8f4a...}`).
>   3. On their very next click, round-robin load balancing routes them across 30 pods. The probability of hitting one of the 29 pods that **do not possess key `{8f4a...}`** is $1 - \frac{1}{30} = \frac{29}{30} = 96.67\%$!
> - **What-If Sensitivity**: Even if you enable Load Balancer Sticky Sessions (`ARRAffinity`), the moment a rolling deployment replaces the 30 pods or scales down, **100% of ephemeral container filesystems are wiped**, logging out every user in the company on every deploy!

<!-- TELEMETRY_WIDGET: title="Multi-Pod DataProtection KeyRing Desync" metric1="CryptographicException Rate (%)" metric2="Active Pod Replicas" threshold="0.1% Decryption Error Ceiling" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Check startup warnings across pods for ephemeral DataProtection storage
kubectl logs -n prod -l app=web-bff | grep -E "DataProtection|key ring|ephemeral"
# Output: warn: Microsoft.AspNetCore.DataProtection.KeyManagement.XmlKeyManager[35]
#         No XMLencryptor configured. Key {8f4a...} may be persisted to storage in unencrypted form.
#         warn: Microsoft.AspNetCore.DataProtection.Repositories.EphemeralXmlRepository[50]
#         Using an in-memory repository. Keys will not be persisted to storage.

# Step 2: List generated key IDs inside two different pods to confirm split-brain KeyRings
kubectl exec -n prod deploy/web-bff -- ls -la /home/app/.aspnet/DataProtection-Keys
```

### Observed Culprit Code Snippet
```csharp
// ❌ MISSING SHARED PERSISTENCE & ENVELOPE ENCRYPTION IN Program.cs:
builder.Services.AddDataProtection(); // Defaults to local container filesystem!
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did Staging pass 100% of tests while Production failed 96.6% of requests, and why is enabling Load Balancer Sticky Sessions an anti-pattern fix? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. How the ASP.NET Core DataProtection KeyRing Works
* DataProtection encrypts cookies, OIDC `state`/`nonce` correlation cookies, and Antiforgery tokens using authenticated symmetric encryption (`AES-256-CBC` + `HMACSHA256` or `AES-256-GCM`).
* Each key XML file contains a unique `<key id="GUID">` and a master key payload.
* In a rootless Chiseled container (`USER app`) without a persisted volume or configured `PersistKeysTo*`, DataProtection falls back to `EphemeralXmlRepository` (in-memory only) or container-local disk.

### 2. Envelope Encryption Architecture (Blob Storage + KeyVault KEK)
* Storing raw XML keys in shared Blob Storage or Redis without encryption exposes the master symmetric key if storage is read.
* **Envelope Encryption**: DataProtection generates the symmetric **Data Encryption Key (DEK)**, wraps (encrypts) the DEK using an asymmetric RSA **Key Encryption Key (KEK)** inside Azure KeyVault / AWS KMS (`ProtectKeysWithAzureKeyVault`), and stores the encrypted `keys.xml` in Azure Blob Storage (`PersistKeysToAzureBlobStorage`). Pods download and unwrap `keys.xml` into memory on boot and every 24 hours (`0ms` per-request KeyVault network latency!).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using Azure.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

namespace PrincipalJourney.Authentication.WarRoom;

public static class DistributedDataProtectionSetup
{
    public static IServiceCollection AddPrincipalDataProtection(
        this IServiceCollection services,
        Uri blobKeysUri,
        Uri keyVaultKeyIdentifier)
    {
        var credential = new DefaultAzureCredential();

        services.AddDataProtection()
            // 1. Isolate cryptographic purpose across microservices so Service A cannot decrypt Service B's cookies
            .SetApplicationName("PrincipalJourney.WebBff.Prod")
            // 2. Persist shared KeyRing XML to Azure Blob Storage (shared across all 30+ pods)
            .PersistKeysToAzureBlobStorage(blobKeysUri, credential)
            // 3. Envelope-encrypt the XML master keys at rest using Azure KeyVault HSM key
            .ProtectKeysWithAzureKeyVault(keyVaultKeyIdentifier, credential)
            // 4. Rotate symmetric keys every 90 days (old keys remain in ring for decryption of existing cookies)
            .SetDefaultKeyLifetime(TimeSpan.FromDays(90));

        return services;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Ephemeral Local Keys) | After (Blob + KeyVault Envelope) | Validation & Rollback Procedure |
|---|---|---|---|
| **Multi-Pod Cookie Decryption Success** | `3.33%` (`1/30` pods) | **`100.0%`** across all 30 pods | Staging runs mandatory `replicas: 3` with sticky sessions disabled in CI tests. |
| **Session Survival Across Rolling Deploy** | `0%` (All users logged out) | **`100.0%`** (Zero user impact) | Perform `kubectl rollout restart` during active k6 authenticated load test. |
| **Per-Request KeyVault Latency** | N/A | **`0.00 ms`** (Unwrapped once at startup/refresh) | Verify KeyVault metrics show `< 2` calls/day per pod. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just turn on `ARRAffinity` (Sticky Sessions) on the Ingress Load Balancer? That takes 30 seconds and routes each user back to the pod that encrypted their cookie!"*

**The Principal Defense**:
> *"Sticky Sessions mask the bug until the next deployment, autoscaler scale-down, or node eviction. The moment Kubernetes terminates Pod #4 during a rolling update or spot eviction, every user pinned to Pod #4 loses their key and gets logged out mid-checkout. Worse, if a user fails an OAuth2 login redirect (where the IdP `POST /signin-oidc` callback lands on a different connection pool), the `CorrelationCookie` decryption fails immediately."*

### Question 2 (The Second-Order Failure Mode):
> *"If 30 pods all start up simultaneously and notice the current key is expiring, won't all 30 pods generate 30 competing new keys and overwrite `keys.xml` in Blob Storage?"*

**The Principal Defense**:
> *"`AzureBlobXmlRepository` uses **HTTP ETag Optimistic Concurrency (`If-Match`)** when writing `keys.xml`. If two pods attempt to append a newly rotated key simultaneously, the second writer receives `412 Precondition Failed`, re-reads the updated XML containing Pod #1's new key, merges, and sees a valid future key already exists!"*

### Question 3 (The FinOps / Cost Axis):
> *"Setting up dedicated HSM-backed KeyVault + Geo-Redundant Blob Storage across 15 internal microservices costs $1,200/month. Why do stateless JWT resource APIs even have DataProtection enabled?"*

**The Principal Defense**:
> *"Stateless Bearer-JWT resource APIs that do not issue cookies, OIDC `state` challenges, or Antiforgery tokens **do not need shared DataProtection persistence at all**! Only the Edge BFF / Identity Gateway services that terminate browser cookies require shared KeyRing persistence (~$15/month total for a single shared BFF Blob + standard KeyVault key)."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0203 — Ephemeral Container DataProtection KeyRing Desync

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 14 minutes

## Five Whys Root Cause Chain
1. **Why did 96.6% of requests fail with CryptographicException?** -> Pods could not find the key ID used to encrypt the cookie.
2. **Why did each pod have a different key ID?** -> `AddDataProtection()` was called without `PersistKeysTo*`, defaulting to ephemeral per-pod storage.
3. **Why did Staging pass 100% of E2E tests?** -> Staging ran with `replicas: 1`, so every request hit the single pod that created the key!
4. **Why wasn't the startup warning caught?** -> `XmlKeyManager[35]` logs at `LogLevel.Warning`, which did not fail the deployment.
5. **Why didn't static analysis catch it?** -> No `NetArchTest` or startup validator checked for `EphemeralXmlRepository` in non-Development environments.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Configure `PersistKeysToAzureBlobStorage` + `ProtectKeysWithAzureKeyVault` | BFF Team | Startup health check fails if `IXmlRepository` is `EphemeralXmlRepository` in Prod |
| P1 | Set minimum `replicas: 2` with round-robin routing in Staging for all services | Platform | Bicep/Helm linter enforces `replicas >= 2` in staging |
```
