# 07 - Claims-Based & Policy-Based Authorization Architecture

> "Role-based authorization (`[Authorize(Roles = "Admin")]`) is a legacy relic that creates rigid, untestable, unmaintainable code.
>
> Modern enterprise authorization is built on granular Claims, Requirements, and Policy Evaluation Engines."

---

# Why Should a Principal Engineer Care?

In naive codebases, authorization is scattered across endpoints like this:

```csharp
[Authorize(Roles = "SuperAdmin,RegionalManager,Auditor")]
[HttpPost("refund")]
public async Task<IActionResult> IssueRefund([FromBody] RefundRequest request)
{
    if (User.IsInRole("RegionalManager") && request.Amount > 10000)
    {
        return Forbid();
    }
    // ...
}
```

This approach leads to three fatal architectural flaws:
1. **Role Explosion**: Every new business condition forces the creation of new composite roles (`ManagerWithRefundApprovalUnder10k`), turning IAM role management into an unmanageable mess.
2. **Scattered Authorization Logic**: Authorization rules are mixed directly into controller actions, making unit testing impossible without full HTTP context mocking.
3. **Inability to Evolve**: Changing a security policy requires refactoring dozens of controllers across multiple repositories.

As a Principal Engineer, you design a **declarative, decoupled Policy-Based Authorization engine**.

---

# The Four Pillars of ASP.NET Core Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Policy (The Contract):                                                   │
│    A named rule exposed to endpoints: [Authorize(Policy = "CanIssueRefund")]│
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Requirement (The Data):                                                  │
│    An IAuthorizationRequirement class holding rule parameters (e.g. MaxLimit)│
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Handler (The Logic):                                                     │
│    An AuthorizationHandler<TRequirement> executing the verification logic.  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Context & ClaimsPrincipal (The State):                                   │
│    The user's claims, tenant state, and resource being evaluated.           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Designing a Real-World Custom Policy: Financial Limit Requirement

### Step 1: Define the Requirement (`FinancialLimitRequirement.cs`)
```csharp
public sealed class FinancialLimitRequirement : IAuthorizationRequirement
{
    public decimal MaximumAmount { get; }

    public FinancialLimitRequirement(decimal maximumAmount)
    {
        MaximumAmount = maximumAmount;
    }
}
```

---

### Step 2: Implement the Authorization Handler (`FinancialLimitHandler.cs`)

```csharp
public sealed class FinancialLimitHandler : AuthorizationHandler<FinancialLimitRequirement>
{
    private readonly ILogger<FinancialLimitHandler> _logger;

    public FinancialLimitHandler(ILogger<FinancialLimitHandler> logger)
    {
        _logger = logger;
    }

    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, 
        FinancialLimitRequirement requirement)
    {
        // 1. Check if user has the refund claim
        var limitClaim = context.User.FindFirst("max_refund_limit");
        if (limitClaim == null || !decimal.TryParse(limitClaim.Value, out var userLimit))
        {
            _logger.LogWarning("User {UserId} missing max_refund_limit claim", 
                context.User.FindFirst("sub")?.Value);
            return Task.CompletedTask; // Not succeeded
        }

        // 2. Evaluate requirement
        if (userLimit >= requirement.MaximumAmount)
        {
            // Mark requirement as satisfied
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

---

### Step 3: Register Policies in `Program.cs`

```csharp
builder.Services.AddSingleton<IAuthorizationHandler, FinancialLimitHandler>();

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("StandardRefundPolicy", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("scope", "orders.refund");
        policy.Requirements.Add(new FinancialLimitRequirement(maximumAmount: 1000m));
    })
    .AddPolicy("ExecutiveRefundPolicy", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireRole("Executive");
        policy.Requirements.Add(new FinancialLimitRequirement(maximumAmount: 50000m));
    });
```

---

### Step 4: Apply to Minimal APIs or Controllers

```csharp
app.MapPost("/api/v1/orders/{id}/refund", async (Guid id, RefundRequest request) =>
{
    // Clean, declarative, 100% decoupled from role strings:
    return Results.Ok(await ProcessRefundAsync(id, request));
})
.RequireAuthorization("StandardRefundPolicy");
```

---

# Multi-Handler Evaluation & The Failure Contract

In ASP.NET Core:
1. Multiple handlers can be registered for the **same requirement**.
2. If **any single handler** calls `context.Succeed(requirement)`, the requirement is considered satisfied.
3. If a handler calls `context.Fail()`, the entire authorization evaluation is **immediately failed and cannot be overridden by any other handler**.

```
                           Policy Evaluation
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
      SeniorManagerHandler                     ContractorOverrideHandler
    • Calls context.Succeed()                • Calls context.Fail() (Contractor blocked!)
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
                   Final Result: FAIL (403 Forbidden)
                   (Explicit Failure Always Wins!)
```

---

# Common Mistakes

❌ **Hardcoding Role Strings Across Endpoints**
```csharp
[Authorize(Roles = "Admin,SuperAdmin,Manager")] // Fragile: Renaming a role breaks authorization silently
```
✅ **Use Policies (`[Authorize(Policy = "CanManageStore")]`)**.

❌ **Calling `context.Fail()` Inside Normal Handlers**
```csharp
// ANTI-PATTERN: Calling context.Fail() prevents fallback handlers from succeeding.
```
✅ **Simply return without calling `context.Succeed()`, unless you want to explicitly veto all other handlers.**

❌ **Loading Heavy Database Graphs Inside Handlers**
```csharp
// Handlers run synchronously within the authorization pipeline. Keep them fast and focused on claims or cached data.
```

---

# Architect's Decision

### Scenario
Nova Commerce requires a unified authorization model supporting 14 business permissions across 5 distinct user personas (Store Owner, Branch Manager, Cashier, Auditor, Customer).

### Decision:
1. **No direct role checks in endpoints**: All controllers and Minimal APIs enforce named policies.
2. **Fine-Grained Permissions**: Identity Provider issues granular permission claims (e.g. `perm:orders.view`, `perm:orders.edit`).
3. **Dynamic Requirement Handlers**: Complex conditions (e.g. branch ownership, IP restrictions, financial limits) encapsulated in dedicated, unit-tested `AuthorizationHandler` classes.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Roles | "I checked `User.IsInRole("Admin")`." |
| **Senior** | Declarative Policies | "I created custom policies in `AddAuthorizationBuilder()`." |
| **Principal** | Decoupled Governance & Extensibility | "How are policies composed? How does the multi-handler failure semantics support organizational delegation? How do we test authorization rules in isolation?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Policy-based authorization in ASP.NET Core — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies)
- [Claims-based authorization in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/claims)
- [NIST SP 800-162: Guide to Attribute Based Access Control (ABAC)](https://csrc.nist.gov/publications/detail/sp/800-162/final)
