# 10 - ASP.NET Core Data Protection API & Key Ring Architecture

> "Never implement your own symmetric encryption routines with raw AES/CBC.
>
> Use the ASP.NET Core Data Protection API for authenticated, tamper-proof, auto-rotating envelope encryption."

---

# Why Should a Principal Engineer Care?

Developers frequently need to encrypt sensitive state:
- Antiforgery / CSRF tokens.
- Secure session cookie payloads.
- Temporary email verification tokens.
- Sensitive credit card tokens stored in transit.

If you write custom cryptographic code (`new AesManaged()`):
- You will likely botch initialization vector (IV) uniqueness, authenticated encryption (HMAC / AES-GCM), key derivation (PBKDF2/HKDF), or secret key rotation.

The **ASP.NET Core Data Protection API (`IDataProtector`)** provides built-in:
- **Authenticated Encryption**: Encrypts and cryptographically signs data using **AES-256-CBC + HMAC-SHA256** or **AES-256-GCM**.
- **Cryptographic Sub-Key Derivation (Purposes)**: Isolates encryption contexts so a token generated for "EmailConfirmation" cannot be decrypted as a "PasswordReset" token.
- **Automated 90-Day Key Ring Rotation**: Seamlessly generates new master keys while retaining legacy keys for decryption.

---

# Production Story

Wednesday.

04:15 PM.

Nova Commerce scales its checkout API cluster from 2 container pods to 12 container pods in Kubernetes during a marketing campaign.

Immediately, thousands of users begin experiencing random authentication failures:

```
CryptographicException: The key {3b82f6-a94b-...} was not found in the key ring.
```

### The Root Cause:
1. By default, ASP.NET Core stores Data Protection keys in the local container filesystem (`/root/.aspnet/DataProtection-Keys`).
2. Each Kubernetes pod generated its **own isolated, in-memory key ring**.
3. A user whose cookie was encrypted by Pod #1 sent their next request to Pod #2 via the round-robin load balancer.
4. Pod #2 did not possess Pod #1's private key, threw a `CryptographicException`, and forcibly logged out the user.

The fix required centralizing the Data Protection Key Ring in cloud blob storage with Key Vault encryption.

---

# The Distributed Data Protection Architecture

```
                                    Pod 1 (K8s)                     Pod 2 (K8s)
                                         │                               │
                                         ▼                               ▼
                           ┌───────────────────────────────────────────────────────────┐
                           │   ASP.NET Core Data Protection Subsystem (IDataProtector) │
                           └─────────────────────────────┬─────────────────────────────┘
                                                         │
                                  Reads & Writes Shared Key XML
                                                         │
                                                         ▼
                                   ┌───────────────────────────┐
                                   │ Azure Blob Storage / Redis│
                                   │ (Centralized Key Ring)    │
                                   └─────────────┬─────────────┘
                                                 │
                               Encrypted with RSA Master Key (Key Vault)
                                                 │
                                                 ▼
                                   ┌───────────────────────────┐
                                   │   Azure Key Vault (HSM)   │
                                   │ (Envelope Master Key)     │
                                   └───────────────────────────┘
```

---

# Implementing Distributed Data Protection in .NET

```csharp
using Azure.Identity;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsProduction())
{
    var blobUri = new Uri(builder.Configuration["DataProtection:BlobUri"]!);
    var keyVaultKeyUri = new Uri(builder.Configuration["DataProtection:KeyVaultKeyUri"]!);

    builder.Services.AddDataProtection()
        .SetApplicationName("NovaCommerce.Production")
        // 1. Centralize key XML repository in Azure Blob Storage:
        .PersistKeysToAzureBlobStorage(blobUri, new DefaultAzureCredential())
        // 2. Encrypt the key ring at rest using Azure Key Vault RSA HSM key:
        .ProtectKeysWithAzureKeyVault(keyVaultKeyUri, new DefaultAzureCredential())
        // 3. Configure automated 90-day key lifetime:
        .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
}
```

---

# Cryptographic Purpose Isolation (`IDataProtector.CreateProtector`)

```csharp
public class TokenService
{
    private readonly IDataProtector _emailProtector;
    private readonly IDataProtector _passwordProtector;

    public TokenService(IDataProtectionProvider provider)
    {
        // Purpose Strings derive distinct cryptographic sub-keys:
        _emailProtector = provider.CreateProtector("NovaCommerce.Auth.EmailConfirmation");
        _passwordProtector = provider.CreateProtector("NovaCommerce.Auth.PasswordReset");
    }

    public string GenerateEmailToken(Guid userId) =>
        _emailProtector.Protect(userId.ToString());

    public Guid ValidateEmailToken(string token)
    {
        // An attacker CANNOT pass a PasswordReset token here; decryption will fail!
        var raw = _emailProtector.Unprotect(token);
        return Guid.Parse(raw);
    }
}
```

---

# Common Mistakes

❌ **Leaving Data Protection Storage as Local Default in Containers**
```csharp
// DISASTER: Every pod restart or scale-out wipes the keys, invalidating all user cookies and tokens!
```
✅ **Always persist keys to shared storage (Azure Blob, Redis, S3, SQL).**

❌ **Storing Keys in Shared Storage Without At-Rest Envelope Encryption**
```csharp
// DANGEROUS: Anyone with read access to the Blob container can decrypt all session cookies and tokens!
```
✅ **Protect keys with Azure Key Vault / AWS KMS.**

---

# Architect's Decision

### Scenario
Nova Commerce runs across 3 Kubernetes clusters with autoscaling.

### Strategy:
1. **Application Name**: Explicitly fixed as `NovaCommerce.Platform` across all services.
2. **Persistence**: Keys stored in Azure Blob Storage with automated immutable versioning.
3. **Envelope Encryption**: Azure Key Vault HSM RSA 3072-bit master key.
4. **Key Lifetime**: Automated 90-day rotation; old keys retained permanently in read-only mode for decryption.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Functionality | "I used `Aes` to encrypt the string." |
| **Senior** | Framework API | "I injected `IDataProtectionProvider`." |
| **Principal** | Distributed Key Ring Governance | "How does our key ring scale across container pods? What is our envelope encryption topology? How do we handle master key rollover without invalidating active sessions?" |

---

# Learning Resources & References

### Authoritative Documentation
- [ASP.NET Core Data Protection Overview](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction)
- [Key storage providers in ASP.NET Core (Azure Blob / Redis)](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-storage-providers)
- [Data Protection cryptographic algorithms and key management](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/cryptographic-algorithms)
