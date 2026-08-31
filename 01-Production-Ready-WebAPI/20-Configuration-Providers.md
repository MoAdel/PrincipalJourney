# 20 - Enterprise Configuration & Secret Management

> "Configuration is what allows the same binary to run across local machines, test clusters, and production data centers.
>
> Secret management is what prevents that same binary from leaking your organization's kingdom keys."

---

# Why Should a Principal Engineer Care?

Many teams start by putting connection strings and API keys into `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=tcp:sql.novacommerce.com;Database=Prod;User Id=admin;Password=SuperSecret123!;"
  }
}
```

This leads to catastrophic security and operational failures:
1. **Source Code Secret Leaks**: Developers commit credentials to GitHub, exposing production databases to automated bot scrapers.
2. **Environment Contamination**: Staging environments accidentally point to production queues or payment gateways.
3. **Outages During Secret Rotation**: When DB passwords or API keys are rotated, every running service crashes because configuration cannot reload dynamically.

As a Principal Engineer, you design a **multi-layered, zero-trust configuration architecture** where:
- Secrets are separated from non-sensitive settings.
- Cloud Managed Identities (Azure Managed Identity / AWS IAM) eliminate credentials entirely.
- Dynamic reload via `IOptionsMonitor` enables zero-downtime secret rotation.

---

# Production Story

Sunday.

02:00 AM.

The security operations center triggers an automated secret rotation policy, rotating the production SQL database password in Azure Key Vault.

Within 60 seconds, all 40 API instances began throwing `SqlException: Login failed for user 'app-svc'`.

### What Went Wrong:
1. The application had bound the database connection string at startup using a Singleton `IOptions<DatabaseOptions>`.
2. Even though Azure Key Vault updated the secret, the Singleton `IOptions` instance never reloaded.
3. When existing pooled connections expired and attempted to re-authenticate, they used the old password and were locked out by the database server.

The entire platform remained down until a DevOps engineer manually rebooted all 40 container pods.

The outage was not caused by rotation. It was caused by the failure to design for **dynamic configuration updates**.

---

# The Enterprise Configuration Hierarchy

ASP.NET Core resolves configuration in a strict hierarchical order where **later providers override earlier providers**:

```
1. appsettings.json
        │ (Base non-sensitive defaults)
        ▼
2. appsettings.{Environment}.json
        │ (Environment-specific overrides: Staging, Production)
        ▼
3. User Secrets (Development Only)
        │ (Local developer machine secrets)
        ▼
4. Environment Variables
        │ (Container / Kubernetes ConfigMaps & Secrets)
        ▼
5. Azure Key Vault / AWS Secrets Manager
        │ (Production Secrets, Certificates, API Keys)
        ▼
6. Command-Line Arguments
        │ (Explicit runtime launch overrides)
        ▼
Final IConfigurationRoot
```

---

# Environment Variables: The Double-Underscore Rule

In Linux containers and Kubernetes:
- JSON nested hierarchies use colons (e.g., `Database:ConnectionString`).
- Linux environment variables **do not support colons** in variable names.

ASP.NET Core resolves this using **double underscores (`__`)**:

```bash
# In Kubernetes Pod manifest or Dockerfile:
export Database__ConnectionString="Server=sql-prod;Database=Orders;..."
export Storage__RetryCount="5"
```

The runtime configuration provider automatically translates `Database__ConnectionString` into the hierarchical key `Database:ConnectionString`.

---

# Zero-Trust Secret Management with Azure Key Vault

In production, eliminate hardcoded secrets using **Azure Key Vault** and **Managed Identities**:

```csharp
var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsProduction())
{
    var keyVaultUri = new Uri(builder.Configuration["KeyVault:VaultUri"]!);

    // Connect using Managed Identity (Zero passwords stored in code or config!):
    builder.Configuration.AddAzureKeyVault(
        keyVaultUri, 
        new DefaultAzureCredential(),
        new AzureKeyVaultConfigurationOptions
        {
            // Poll for rotated secrets every 15 minutes:
            ReloadInterval = TimeSpan.FromMinutes(15)
        });
}
```

### Why Managed Identity is the Gold Standard:
- **No Passwords**: The cloud infrastructure (Azure / AWS) automatically issues short-lived, rotated OAuth tokens directly to the container VM.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions (e.g. read-only access to specific secrets).

---

# Dynamic Reload with `IOptionsMonitor<T>`

When a secret rotates in Key Vault, how do your background services and repositories update without a restart?

```csharp
public sealed class PaymentGatewayClient
{
    private readonly IOptionsMonitor<PaymentGatewayOptions> _optionsMonitor;
    private readonly ILogger<PaymentGatewayClient> _logger;

    public PaymentGatewayClient(
        IOptionsMonitor<PaymentGatewayOptions> optionsMonitor,
        ILogger<PaymentGatewayClient> logger)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;

        // Subscribe to live rotation events:
        _optionsMonitor.OnChange(newOptions =>
        {
            _logger.LogInformation("Payment Gateway API Key rotated successfully at {Time}", DateTime.UtcNow);
        });
    }

    public async Task ProcessAsync()
    {
        // Always gets the latest rotated secret:
        var currentApiKey = _optionsMonitor.CurrentValue.ApiKey;
        // ...
    }
}
```

---

# Common Mistakes

❌ **Committing `appsettings.Production.json` with Real Passwords to Git**
```json
{ "Password": "RealProdPassword" } // COMMITTED TO GIT = COMPROMISED
```
✅ **Add `appsettings.Production.json` or sensitive secrets to `.gitignore`; inject secrets via Key Vault or CI/CD pipelines.**

❌ **Using `IConfiguration` Everywhere Directly**
```csharp
var conn = _config["Database:Connection"]; // Magic strings, no validation, hard to test
```
✅ **Use strongly typed Options classes (`IOptions<T>`, `IOptionsMonitor<T>`).**

❌ **Failing to Validate Configuration at Startup**
```csharp
// If a required secret is missing in Key Vault, the app starts and only crashes hours later when a customer hits the endpoint.
```
✅ **Use `builder.Services.AddOptions<T>().BindConfiguration("...").ValidateDataAnnotations().ValidateOnStart();` to Fail Fast.**

---

# Architect's Decision

### Scenario
Nova Commerce deploys microservices across 3 Azure regions. Compliance requires automated monthly secret rotation for all databases and payment credentials.

### Strategy:
1. **Configuration Layering**: Base defaults in `appsettings.json`, cloud overrides in Azure App Configuration, secrets in Azure Key Vault.
2. **Authentication**: All container instances authenticate to Key Vault using Azure Managed Identities (zero stored client secrets).
3. **Rotation**: Key Vault provider configured with 15-minute reload interval.
4. **Consumption**: Database connection pools and HTTP clients use `IOptionsMonitor` with dynamic re-connection on credential rotation.
5. **Validation**: Critical configuration validated on startup via `ValidateOnStart()`.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | File storage | "I put my API key in appsettings.json." |
| **Senior** | Environment variables | "I override settings in Docker using environment variables." |
| **Principal** | Zero-Trust & Lifecycle | "How do we eliminate long-lived credentials with Managed Identities? How do our connection pools handle automated secret rotation without dropping customer requests?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Configuration in ASP.NET Core — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/)
- [Azure Key Vault Configuration Provider in .NET](https://learn.microsoft.com/en-us/azure/key-vault/general/tutorial-net-virtual-machine)
- [Zero Trust Security Model Architecture](https://learn.microsoft.com/en-us/security/zero-trust/)

---

# Self Assessment

1. Explain the order of precedence in ASP.NET Core's default configuration provider hierarchy.
2. How does ASP.NET Core map Linux environment variables with double underscores (`__`) to nested JSON keys?
3. What is the security advantage of Azure Managed Identity over storing client credentials in environment variables?
4. How does `IOptionsMonitor<T>` enable zero-downtime secret rotation compared to `IOptions<T>`?
5. Why is `ValidateOnStart()` considered a critical production safety pattern?
