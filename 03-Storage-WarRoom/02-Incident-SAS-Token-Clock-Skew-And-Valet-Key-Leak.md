# Incident 02: The SAS Token Clock-Skew Rejection & Over-Scoped Valet Key Leak

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Global Document Portal / Azure Blob Storage User Delegation SAS  
> **Business Impact**: 18% of instant client uploads failing with `HTTP 403 AuthenticationFailed (SignedStart time is in the future)` + Security Audit P0 finding on Container-scoped SAS tokens  
> **Competencies Mastered**: NTP Clock Skew (`st` Start Time Backdating), User Delegation SAS (`GetUserDelegationKeyAsync`) vs. Account Key SAS, Principle of Least Privilege (`sr=b`, `sp=cw`)

---

## 🚨 1. The 09:20 AM Crisis Briefing

After migrating large uploads to the **Valet Key Pattern (SAS Tokens)**, two simultaneous crises erupted:
1. `18%` of clients attempting to upload within `100ms` of receiving their SAS URL received `HTTP 403 Forbidden (AuthenticationFailed: SignedStart [st] is in the future)`.
2. A penetration tester demonstrated that by tweaking the blob path in the returned SAS URL, Tenant A could overwrite Tenant B's files in the same container!

```text
[09:20:05] Storage Alert: Azure Blob HTTP 403 AuthenticationFailed spike (18.4% of PUT Block requests).
[09:20:30] RED HERRING: Frontend Lead blames "Browser local timezone settings in UTC+3 vs UTC+0!"
[09:21:15] Security P0: Pentest report proves SAS token has 'sr=c' (Container scope) instead of 'sr=b' (Blob scope)!
```

> 📐 **Derive It (Fermi Mode): NTP Clock Drift Between App Node and Storage Stamp**
> - **Inputs**: `AppNodeClockAheadMs = 1800`, `ClientNetworkRTTMs = 45`, `SasStartOffsetSec = 0`
> - **Formula**: `StoragePerceivedDeltaMs = ClientNetworkRTTMs - AppNodeClockAheadMs`
> - **Step-by-Step**:
>   1. All SAS timestamps are UTC (`ISO-8601`), so browser timezones are a total red herring!
>   2. However, VM host clocks across distributed data centers drift by `500ms–3,000ms` between NTP sync polls.
>   3. AKS Node #7's clock was `1.8 seconds` ahead of the Azure Storage stamp's clock. When Pod #7 minted a SAS token with `StartsOn = DateTimeOffset.UtcNow` (`09:20:05.000Z`), the client immediately called Azure Storage `45ms` later, where the storage server's clock read `09:20:03.245Z` (`-1,755ms` before `StartsOn`) $ightarrow$ instant `HTTP 403`!
> - **What-If Sensitivity**: Setting `StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5)` completely eliminates clock-skew `403` errors across all nodes while keeping `ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(10)` tightly bounded!

<!-- TELEMETRY_WIDGET: title="SAS Clock-Skew 403s & Scope Enforcement" metric1="Blob PUT HTTP 403 Rate (%)" metric2="Host NTP Drift (ms)" threshold="0% Clock-Skew Rejections" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Inspect the exact Azure Storage extended error code in the 403 XML response header
curl -i -X PUT "<SAS_URL>" -H "x-ms-blob-type: BlockBlob" --data-binary "test"
# Output: <Code>AuthenticationFailed</Code>
#         <Message>Server failed to authenticate the request. SignedStart [2026-10-17T09:20:05Z] must be before CurrentTime [2026-10-17T09:20:03Z]</Message>

# Step 2: Inspect the query string parameters of the minted SAS URL
echo "<SAS_URL>" | tr '&' '
'
# Output shows: sr=c (Resource = Entire Container!) and sp=racwdl (Permissions = Read/Add/Create/Write/Delete/List!)
```

### Observed Culprit Code Snippet
```csharp
// ❌ VULNERABLE & FRAGILE SAS GENERATION:
var sasBuilder = new BlobSasBuilder
{
    BlobContainerName = "tenant-documents",
    Resource = "c", // ❌ CRITICAL VULNERABILITY: 'c' grants access to the ENTIRE container, not a single blob!
    StartsOn = DateTimeOffset.UtcNow, // ❌ FRAGILE: Breaks if App VM clock is 500ms ahead of Storage stamp!
    ExpiresOn = DateTimeOffset.UtcNow.AddHours(24)
};
sasBuilder.SetPermissions(BlobContainerSasPermissions.All); // ❌ Grants List & Delete across all tenants!
```

<!-- PREDICT_GATE: Commit your hypothesis: Why is the browser's timezone irrelevant to SAS `st` validation, why did `StartsOn = UtcNow` fail on 18% of pods, and what 3 parameters lock a Valet Key to a single tenant blob? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. User Delegation SAS (Entra ID) vs. Account Key SAS
* Signing SAS tokens with the Storage Account Master Key (`StorageSharedKeyCredential`) means every pod holds a god-mode key that cannot be rotated without updating apps, and revoking a single leaked SAS requires rotating the entire storage account key!
* **User Delegation SAS (`GetUserDelegationKeyAsync`)** signs the SAS using an Entra ID Managed Identity OAuth2 token. You can revoke all User Delegation SAS tokens instantly via `RevokeUserDelegationKeysAsync()` without touching storage keys!

### 2. The 4 Mandatory SAS Scope Constraints
1. `Resource = "b"` (Specific single `BlobName = $"{tenantId}/{uploadId}.pdf"`).
2. `StartsOn = timeProvider.GetUtcNow().AddMinutes(-5)` (5-minute NTP clock-skew buffer).
3. `ExpiresOn = timeProvider.GetUtcNow().AddMinutes(10)` (Short TTL).
4. `BlobSasPermissions.Create | BlobSasPermissions.Write` (No `Read`, `Delete`, or `List` on upload keys!).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;

namespace PrincipalJourney.Storage.WarRoom;

public sealed class ZeroTrustValetKeyService(
    BlobServiceClient blobServiceClient,
    TimeProvider timeProvider)
{
    public async Task<Uri> MintSingleBlobUploadSasAsync(string tenantId, Guid documentId, string clientIp, CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        string scopedBlobName = $"{tenantId}/{documentId:N}.bin";

        // 1. Obtain short-lived Entra ID User Delegation Key (cached in memory, refreshed hourly)
        UserDelegationKey delegationKey = await blobServiceClient.GetUserDelegationKeyAsync(
            startsOn: now.AddMinutes(-5),
            expiresOn: now.AddHours(1),
            cancellationToken: ct);

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = "quarantine-uploads",
            BlobName = scopedBlobName,
            Resource = "b",                               // STRICTLY scoped to this single blob path!
            StartsOn = now.AddMinutes(-5),                // -5m buffer eliminates NTP clock-skew 403s
            ExpiresOn = now.AddMinutes(10),               // 10m max upload initiation window
            Protocol = SasProtocol.Https,                 // Enforce TLS 1.2/1.3 only
            IPRange = new SasIPRange(System.Net.IPAddress.Parse(clientIp)) // Bind to caller IP
        };

        // 2. Grant ONLY Create (new blob) — disallow Overwrite/Read/Delete/List!
        sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Add | BlobSasPermissions.Write);

        var blobClient = blobServiceClient
            .GetBlobContainerClient("quarantine-uploads")
            .GetBlobClient(scopedBlobName);

        var uriBuilder = new BlobUriBuilder(blobClient.Uri)
        {
            Sas = sasBuilder.ToSasQueryParameters(delegationKey, blobServiceClient.AccountName)
        };

        return uriBuilder.ToUri();
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (Principal Refactor) | Validation & Rollback Procedure |
|---|---|---|---|
| **Clock-Skew `403` Upload Failures** | `18.4%` | **`0.00%`** (`-5m` `StartsOn` buffer) | Chaos test shifts container fake clock `+120s`; assert SAS uploads succeed. |
| **Cross-Tenant Overwrite Blast Radius** | **Entire Container** (`sr=c`, `sp=all`) | **Zero** (`sr=b`, `sp=caw`, IP-bound, Entra Delegation) | Pentest suite mutates `BlobName` in SAS URL; assert Azure Storage returns `403 SignatureFieldsMismatch`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why include `StartsOn` (`st`) in the SAS token at all since it's an optional parameter in Azure Storage?"*

**The Principal Defense**:
> *"Omitting `st` works for immediate tokens, OR setting `st = UtcNow - 5 minutes` provides an explicit audit anchor in Azure Storage Analytics logs showing the exact minting window while still preventing replay of pre-generated URLs outside the 15-minute total envelope. Either way, you must NEVER set `st = UtcNow` without a negative clock-skew buffer!"*

### Question 2 (The Second-Order Failure Mode):
> *"If `MintSingleBlobUploadSasAsync` calls `blobServiceClient.GetUserDelegationKeyAsync()` on every single upload request at 1,000 RPS, won't Azure ARM / Storage control plane throttle us?"*

**The Principal Defense**:
> *"Yes! `GetUserDelegationKeyAsync` is a control-plane call and must **never** be called per request. A single `UserDelegationKey` valid for `24 hours` can sign millions of individual `10-minute` SAS tokens entirely in memory using local HMAC-SHA256! We cache the `UserDelegationKey` in a singleton background refresher that rotates it every 6 hours."*

### Question 3 (The FinOps / Cost Axis):
> *"To isolate tenants, a consultant proposed provisioning a separate Azure Storage Account per enterprise customer (4,500 customers). Azure has a 250 storage account limit per subscription, requiring 18 subscriptions and custom key management ($6,000/month ops overhead). Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Provisioning a storage account per tenant is an operational anti-pattern unless contractually required for customer-managed HSM keys (BYOK). For 99% of tenants, use a **shared multi-tenant Storage Account partitioned by virtual prefix (`{tenantId}/{documentId}`)** enforced by **Blob-scoped User Delegation SAS (`sr=b`)** + **Azure Blob Encryption Scopes per tenant** if separate KeyVault keys are required."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0302 — SAS Token Clock-Skew & Container Scope Vulnerability

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 3 minutes | **Mitigation Latency (TTM)**: 21 minutes

## Five Whys Root Cause Chain
1. **Why did 18% of uploads fail with 403?** -> AKS Node #7's clock was 1.8s ahead of the Azure Storage stamp.
2. **Why did a 1.8s clock difference fail authentication?** -> `StartsOn` was set to `DateTimeOffset.UtcNow` with 0ms skew buffer.
3. **Why could Tenant A overwrite Tenant B's blobs?** -> `BlobSasBuilder.Resource` was set to `"c"` (Container) with `BlobContainerSasPermissions.All`.
4. **Why wasn't `sr=c` caught in code review?** -> Developers copied a sample snippet meant for an internal admin backup tool.
5. **Why did on-call initially blame browser timezones?** -> Client error handler swallowed the XML `<AuthenticationErrorDetail>` body from Azure Storage.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Scope SAS strictly to `Resource = "b"`, `StartsOn = UtcNow - 5m`, User Delegation Key | Storage Team | Unit test asserts `sasQuery["sr"] == "b"` and `st < UtcNow - 4m` |
| P0 | Rotate Storage Account keys and revoke old SAS tokens | SecOps | Completed during incident mitigation |
```
