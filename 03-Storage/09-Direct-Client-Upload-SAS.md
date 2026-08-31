# 09 - Delegated Access with Shared Access Signatures (SAS)

> "The most resilient and scalable API is one that handles authorization metadata and delegates heavy binary transfers directly to cloud infrastructure."

---

# Why Should a Principal Engineer Care?

If 5,000 mobile users simultaneously upload 200 MB product videos through your ASP.NET Core API servers:
- Your servers must handle **1 Terabyte of ingress network traffic** and **1 Terabyte of egress proxy traffic**.
- Bandwidth costs double, CPU usage spikes, and Kestrel connection pools are starved.

By using **Shared Access Signatures (SAS)**:
- The Web API performs authentication, validates permissions, and generates a **cryptographically signed, time-limited, scoped SAS URL**.
- The client uploads the binary data **directly to Azure Blob Storage / S3**.
- Web API server network and memory load is reduced by **99%**.

---

# Account SAS vs Service SAS vs User Delegation SAS

A Principal Engineer understands the critical security boundaries between SAS types:

| SAS Type | Signing Key | Security Risk | Revocation Mechanism | Principal Recommendation |
|---|---|---|---|---|
| **Account SAS** | Master Storage Account Key | 🚨 **Extreme Risk**: Leaking this key compromises the entire storage account. | Regenerate master storage key (breaks all running apps). | ❌ **Forbidden in production** |
| **Service SAS** | Master Storage Account Key | ⚠️ **High Risk**: Scoped to a container/blob, but still signed with master key. | Stored Access Policy (if pre-configured). | ❌ **Avoid** |
| **User Delegation SAS** | Azure AD / Entra ID OAuth Token | 🛡️ **Zero-Trust**: Signed with short-lived Entra ID user/service principal credentials. | Revoke Entra ID identity or let token naturally expire (max 7 days). | ✅ **Principal Gold Standard** |

---

# Generating a User Delegation SAS in .NET

```csharp
public async Task<Uri> GenerateDirectUploadSasUriAsync(
    BlobServiceClient blobServiceClient,
    string containerName,
    string blobName,
    TimeSpan expirationWindow)
{
    // 1. Request User Delegation Key from Azure AD (No master storage keys used!):
    var userDelegationKey = await blobServiceClient.GetUserDelegationKeyAsync(
        startsOn: DateTimeOffset.UtcNow.AddMinutes(-5),
        expiresOn: DateTimeOffset.UtcNow.Add(expirationWindow));

    // 2. Build tightly scoped SAS parameters (Write-only for upload, single blob):
    var sasBuilder = new BlobSasBuilder
    {
        BlobContainerName = containerName,
        BlobName = blobName,
        Resource = "b", // 'b' for single blob
        StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5),
        ExpiresOn = DateTimeOffset.UtcNow.Add(expirationWindow),
        Protocol = SasProtocol.Https
    };

    // Least Privilege: Grant ONLY Create & Write permissions
    sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);

    // 3. Generate signed URI:
    var blobClient = blobServiceClient.GetBlobContainerClient(containerName).GetBlobClient(blobName);
    var sasUri = new BlobUriBuilder(blobClient.Uri)
    {
        Sas = sasBuilder.ToSasQueryParameters(userDelegationKey, blobServiceClient.AccountName)
    }.ToUri();

    return sasUri;
}
```

---

# Common Mistakes

❌ **Generating SAS Tokens with Master Account Keys**
```csharp
// If an attacker intercepts the SAS creation routine, master credentials can be compromised.
```
✅ **Use `BlobServiceClient.GetUserDelegationKeyAsync()` with Azure Managed Identity.**

❌ **Granting Excessive Permissions (Read + Write + Delete + List)**
```csharp
// DANGEROUS: Allows the client to delete or overwrite arbitrary blobs in the container.
```
✅ **Scope permissions strictly: `Create | Write` for uploads; `Read` for downloads.**

❌ **Setting Long SAS Lifetimes (e.g. 24 Hours or 7 Days)**
```csharp
// A stolen SAS URL remains valid for the entire window.
```
✅ **Set SAS expiration to 15 to 30 minutes.**

---

# Architect's Decision

### Scenario
Nova Commerce vendors upload video assets directly from client applications.

### Strategy:
1. **Endpoint**: `POST /api/v1/media/upload-ticket` validates user permissions and returns a User Delegation SAS URL.
2. **Permissions**: Write-only (`BlobSasPermissions.Create | BlobSasPermissions.Write`) scoped to exact GUID blob path.
3. **Expiration**: 15 minutes.
4. **Callback**: Once uploaded, client calls `POST /api/v1/media/confirm` to persist metadata and trigger virus scanning.

---

# Self Assessment

1. Why does Direct-to-Storage upload via SAS reduce web server bandwidth and CPU by up to 99%?
2. What is the fundamental security advantage of User Delegation SAS over Account SAS?
3. What permissions should be granted to a SAS token intended solely for client file upload?
4. How do you prevent a malicious client from overwriting someone else's blob using a SAS token?
