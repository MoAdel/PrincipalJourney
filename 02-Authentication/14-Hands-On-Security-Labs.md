# 14 - Hands-On Security Engineering Labs: Nova Commerce

> "Security architecture is proven through practical implementation, attack simulation, and automated test verification."

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


# Lab 1: End-to-End JWT Bearer Authentication with JWKS Discovery

### Objective:
Configure ASP.NET Core to validate asymmetric RS256 tokens dynamically from an OIDC Identity Provider with strict validation parameters.

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://id.novacommerce.com";
        options.Audience = "api://novacommerce";
        options.RequireHttpsMetadata = true;
        options.MapInboundClaims = false; // Preserve standard JWT claim names

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://id.novacommerce.com",

            ValidateAudience = true,
            ValidAudience = "api://novacommerce",

            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256]
        };
    });
```

---

# Lab 2: Custom Policy-Based Financial Authorization Handler

### Objective:
Implement `IAuthorizationRequirement` and `AuthorizationHandler<T>` to enforce multi-tiered refund limits.

```csharp
public sealed class RefundAuthorizationHandler : AuthorizationHandler<RefundLimitRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, 
        RefundLimitRequirement requirement)
    {
        var limitClaim = context.User.FindFirst("max_refund_limit");
        if (limitClaim != null && decimal.TryParse(limitClaim.Value, out var userLimit))
        {
            if (userLimit >= requirement.Amount)
            {
                context.Succeed(requirement);
            }
        }
        return Task.CompletedTask;
    }
}
```

---

# Lab 3: Imperative Resource-Based Authorization (Anti-BOLA)

### Objective:
Implement `AuthorizationHandler<OperationAuthorizationRequirement, Order>` to verify resource ownership and multi-tenant isolation.

```csharp
public sealed class OrderOwnershipHandler : 
    AuthorizationHandler<OperationAuthorizationRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Order order)
    {
        var userId = context.User.FindFirst("sub")?.Value;
        var tenantId = context.User.FindFirst("tid")?.Value;

        if (order.TenantId == tenantId && (order.CustomerId == userId || context.User.IsInRole("Admin")))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

---

# Lab 4: Single-Use Refresh Token Rotation & Family Replay Detection

### Objective:
Implement atomic refresh token exchange with replay attack detection.

```csharp
public async Task<Result<TokenPair, AuthError>> RotateTokenAsync(string rawRefreshToken, CancellationToken ct)
{
    var tokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(rawRefreshToken));
    var existingToken = await _tokenRepo.GetByHashAsync(tokenHash, ct);

    if (existingToken == null)
    {
        return Result<TokenPair, AuthError>.Failure(new AuthError("INVALID_TOKEN", "Token does not exist."));
    }

    // REPLAY ATTACK DETECTION:
    if (existingToken.IsRevoked || existingToken.IsUsed)
    {
        // Compromise detected: Invalidate entire family immediately!
        await _tokenRepo.RevokeFamilyAsync(existingToken.FamilyId, ct);
        _logger.LogCritical("Security Alert: Replay attack detected for Family {FamilyId}!", existingToken.FamilyId);
        return Result<TokenPair, AuthError>.Failure(new AuthError("REPLAY_DETECTED", "Token theft detected. Session revoked."));
    }

    // Invalidate current token and issue new pair:
    existingToken.MarkUsed();
    var newPair = GenerateTokenPair(existingToken.UserId, existingToken.FamilyId);
    await _tokenRepo.SaveAsync(newPair, ct);

    return Result<TokenPair, AuthError>.Success(newPair);
}
```

---

# Lab 5: Distributed Data Protection with Azure Key Vault & Blob Storage

### Objective:
Configure horizontal scaling of Data Protection keys across container pods.

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("NovaCommerce.Platform")
    .PersistKeysToAzureBlobStorage(new Uri("https://store.blob.core.windows.net/keys/keys.xml"), new DefaultAzureCredential())
    .ProtectKeysWithAzureKeyVault(new Uri("https://vault.vault.azure.net/keys/dataprotection-master"), new DefaultAzureCredential())
    .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
```

---

# Lab 6: Automated Security Architecture Unit Tests (`NetArchTest`)

### Objective:
Write unit tests that fail in CI/CD if any developer accidentally injects `DbContext` or hardcodes role strings in controllers.

```csharp
[Fact]
public void Controllers_Should_Not_Use_Hardcoded_Roles()
{
    var result = Types.InAssembly(typeof(Program).Assembly)
        .That().Inherit(typeof(ControllerBase))
        .ShouldNot().HaveCustomAttributeOrMethodWithAttribute(typeof(AuthorizeAttribute), 
            attr => ((AuthorizeAttribute)attr).Roles != null)
        .GetResult();

    Assert.True(result.IsSuccessful, "Controllers must use Policies, not hardcoded Roles!");
}
```
