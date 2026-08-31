# 08 - Resource-Based & Imperative Authorization (Defeating BOLA / IDOR)

> "Declarative attributes (`[Authorize]`) check who the caller is.
>
> Resource-based authorization checks whether this specific caller is permitted to access this specific entity instance."

---

# Why Should a Principal Engineer Care?

According to the **OWASP API Security Top 10**, the #1 most critical and pervasive vulnerability in modern web APIs is:

> **API1:2023 — Broken Object Level Authorization (BOLA / IDOR)**

Declarative attributes like `[Authorize(Policy = "CanEditOrder")]` cannot protect against BOLA because the attribute executes **before the entity is loaded from the database**. The attribute has no knowledge of the specific `Order.CustomerId` or `Order.TenantId`.

As a Principal Engineer, you design an **Imperative Resource-Based Authorization** layer that evaluates access at the entity level.

---

# Declarative vs Imperative Authorization

```
Declarative Authorization ([Authorize])
┌─────────────────────────────────────────────────────────────────────────────┐
│ Evaluated at Endpoint Boundary (Middleware).                                │
│ Input: HttpContext.User + Route Metadata.                                   │
│ Answers: "Is this user a StoreManager?"                                     │
│ CANNOT answer: "Does this StoreManager manage Store #42 specifically?"      │
└─────────────────────────────────────────────────────────────────────────────┘

Imperative Resource-Based Authorization (IAuthorizationService)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Evaluated inside Application Service / Handler after loading entity.       │
│ Input: HttpContext.User + Loaded Entity (Order, Document, Invoice).         │
│ Answers: "Does User (ID: 105) have ownership/tenant rights over Order 991?" │
│ DEFEATS BOLA / IDOR COMPLETELY.                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Implementing Resource-Based Authorization in ASP.NET Core

### Step 1: Define the Operation Authorization Requirements
```csharp
public static class OrderOperations
{
    public static readonly OperationAuthorizationRequirement Read = 
        new() { Name = nameof(Read) };

    public static readonly OperationAuthorizationRequirement Update = 
        new() { Name = nameof(Update) };

    public static readonly OperationAuthorizationRequirement Cancel = 
        new() { Name = nameof(Cancel) };
}
```

---

### Step 2: Implement the Resource Authorization Handler (`OrderAuthorizationHandler.cs`)

```csharp
public sealed class OrderAuthorizationHandler : 
    AuthorizationHandler<OperationAuthorizationRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Order resource)
    {
        var userId = context.User.FindFirst("sub")?.Value;
        var tenantId = context.User.FindFirst("tid")?.Value;

        // 1. Enforce Multi-Tenant Isolation (Tenant MUST match)
        if (resource.TenantId != tenantId)
        {
            // Cross-tenant access attempt: Do not succeed!
            return Task.CompletedTask;
        }

        // 2. Administrators can perform any operation within their tenant
        if (context.User.IsInRole("TenantAdmin"))
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        // 3. Resource-Owner Evaluation (Customers can read/cancel their own orders)
        if (resource.CustomerId == userId)
        {
            if (requirement == OrderOperations.Read)
            {
                context.Succeed(requirement);
            }
            else if (requirement == OrderOperations.Cancel && resource.Status == OrderStatus.Pending)
            {
                context.Succeed(requirement);
            }
        }

        return Task.CompletedTask;
    }
}
```

---

### Step 3: Enforce in Application Services / CQRS Handlers

```csharp
public sealed class CancelOrderCommandHandler
{
    private readonly IOrderRepository _repository;
    private readonly IAuthorizationService _authorizationService;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CancelOrderCommandHandler(
        IOrderRepository repository,
        IAuthorizationService authorizationService,
        IHttpContextAccessor httpContextAccessor)
    {
        _repository = repository;
        _authorizationService = authorizationService;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<Result<Unit, DomainError>> Handle(CancelOrderCommand command, CancellationToken ct)
    {
        var order = await _repository.GetByIdAsync(command.OrderId, ct);
        if (order == null)
        {
            return Result<Unit, DomainError>.Failure(new DomainError("NOT_FOUND", "Order not found."));
        }

        var user = _httpContextAccessor.HttpContext?.User;
        if (user == null) return Result<Unit, DomainError>.Failure(new DomainError("UNAUTHORIZED", "User context missing."));

        // IMPERATIVE RESOURCE EVALUATION:
        var authResult = await _authorizationService.AuthorizeAsync(user, order, OrderOperations.Cancel);

        if (!authResult.Succeeded)
        {
            // Security Event: User attempted to mutate an order they do not own!
            return Result<Unit, DomainError>.Failure(
                new DomainError("FORBIDDEN", "You do not have permission to cancel this order."));
        }

        order.Cancel();
        await _repository.SaveChangesAsync(ct);
        return Result<Unit, DomainError>.Success(Unit.Value);
    }
}
```

---

# Returning 404 Not Found vs 403 Forbidden on Authorization Failure

A subtle security design decision:

```
Scenario: User A attempts to access User B's private invoice:
GET /api/v1/invoices/INV-99824
```

- **If you return 403 Forbidden**: An attacker confirms that Invoice `INV-99824` exists in the system (Resource Enumeration / Info Disclosure).
- **If you return 404 Not Found**: The attacker cannot determine whether the ID exists or is invalid.

### Principal Recommendation:
For sensitive cross-tenant or private resources, return **`404 Not Found`** when unauthorized callers attempt access by ID, completely blinding attackers from probing database keys.

---

# Common Mistakes

❌ **Assuming `[Authorize]` Protects Against BOLA**
```csharp
[Authorize]
public IActionResult GetInvoice(Guid id) => Ok(_db.Invoices.Find(id)); // VULNERABILITY: Any user can read any invoice!
```
✅ **Always evaluate entity ownership via `IAuthorizationService.AuthorizeAsync(User, entity, ...)` or EF Core global query filters.**

❌ **Performing Authorization in the UI Only**
```javascript
if (user.id === order.customerId) showDeleteButton(); // Attacker calls DELETE /orders/{id} via Postman directly!
```
✅ **Enforce all authorization rules server-side inside domain handlers.**

---

# Architect's Decision

### Scenario
Nova Commerce manages 10 million orders across 5,000 retail merchants.

### Decision:
1. **Multi-Tenancy**: EF Core Global Query Filters automatically scope all database queries by `TenantId` at the SQL level (`WHERE TenantId = @currentTenant`).
2. **Resource-Level Control**: All mutation operations (Cancel, Refund, Update) enforce `IAuthorizationService.AuthorizeAsync(user, resource, operation)`.
3. **Information Disclosure**: Unauthorized cross-tenant queries return `404 Not Found`.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | URL Params | "I got the ID from the URL and queried the DB." |
| **Senior** | In-Code Checks | "I wrote `if (order.UserId != user.Id) return Forbid();` in my controller." |
| **Principal** | Defense-in-Depth & BOLA Elimination | "How do we combine SQL-level tenant query filters, decoupled `AuthorizationHandler<T, TResource>` rules, and audit logging to eliminate BOLA across all use cases?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Resource-based authorization in ASP.NET Core — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased)
- [OWASP API Security Top 10: API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
