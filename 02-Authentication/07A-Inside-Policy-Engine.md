# 07A - Inside the Authorization Policy Engine Internals

> "The ASP.NET Core Authorization Engine is a pipeline of evaluators that evaluates requirements against principals, resources, and custom handlers."

---

# Why This Chapter Exists

When an endpoint decorated with `[Authorize(Policy = "CanRefund")]` is requested:

- Who resolves the policy string to concrete requirement instances?
- What is `IAuthorizationService` and how does `DefaultAuthorizationService` iterate registered handlers?
- How does `AuthorizationHandlerContext` track pending vs satisfied requirements?
- Why is `IAuthorizationEvaluator` responsible for the final boolean decision?

Understanding these internal classes enables you to build dynamic authorization systems (e.g., loading policies from a database or Open Policy Agent (OPA) at runtime).

---

# The Internal Architecture of `IAuthorizationService`

```
Endpoint Execution
        │
        ▼
AuthorizationMiddleware (app.UseAuthorization())
        │
        ▼
IAuthorizationPolicyProvider.GetPolicyAsync("CanRefund")
        │
        ▼
AuthorizationPolicy (Holds IList<IAuthorizationRequirement>)
        │
        ▼
IAuthorizationService.AuthorizeAsync(user, resource, policy)
        │
        ▼
DefaultAuthorizationService (Internal Implementation)
        │
        ├── 1. Construct AuthorizationHandlerContext(requirements, user, resource)
        │
        ├── 2. Resolve all IAuthorizationHandler from DI Container
        │
        ├── 3. For each handler matching requirement / resource:
        │      • Invoke handler.HandleAsync(context)
        │
        ├── 4. Pass context to IAuthorizationEvaluator.Evaluate(context)
        │
        ▼
AuthorizationResult (Succeeded or Failed with FailureReasons)
```

---

# 1. Inside `AuthorizationHandlerContext`

The heart of the evaluation engine is `AuthorizationHandlerContext`:

```csharp
public class AuthorizationHandlerContext
{
    private readonly HashSet<IAuthorizationRequirement> _pendingRequirements;
    private bool _failCalled;

    public ClaimsPrincipal User { get; }
    public object? Resource { get; }
    public IEnumerable<IAuthorizationRequirement> Requirements { get; }

    public bool HasSucceeded => !_failCalled && _pendingRequirements.Count == 0;
    public bool HasFailed => _failCalled;

    public void Succeed(IAuthorizationRequirement requirement)
    {
        _pendingRequirements.Remove(requirement);
    }

    public void Fail()
    {
        _failCalled = true;
    }
}
```

Notice:
- `_pendingRequirements` initially contains **all** requirements specified in the policy.
- When `Succeed(req)` is called, the requirement is removed from the pending set.
- `HasSucceeded` is true **only** when `_pendingRequirements` is empty AND `Fail()` was never called!

---

# 2. Dynamic Policy Resolution with `IAuthorizationPolicyProvider`

What if your permissions change dynamically in a database without restarting the application?

Instead of defining policies statically in `Program.cs`, implement a custom `IAuthorizationPolicyProvider`:

```csharp
public sealed class DynamicPermissionPolicyProvider : DefaultAuthorizationPolicyProvider
{
    private readonly AuthorizationOptions _options;

    public DynamicPermissionPolicyProvider(IOptions<AuthorizationOptions> options) 
        : base(options)
    {
        _options = options.Value;
    }

    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        // 1. Check if it's a statically registered policy first:
        var policy = await base.GetPolicyAsync(policyName);
        if (policy != null) return policy;

        // 2. Dynamically construct policy on-the-fly:
        // Format: "Permission:orders.create"
        if (policyName.StartsWith("Permission:", StringComparison.OrdinalIgnoreCase))
        {
            var permission = policyName["Permission:".Length..];
            return new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new PermissionRequirement(permission))
                .Build();
        }

        return null;
    }
}
```

#### Registration:
```csharp
builder.Services.AddSingleton<IAuthorizationPolicyProvider, DynamicPermissionPolicyProvider>();
```

Now, any endpoint can use `[Authorize(Policy = "Permission:orders.refund")]` without manual registration in `Program.cs`!

---

# Self Assessment

1. Explain the relationship between `IAuthorizationPolicyProvider`, `IAuthorizationService`, and `IAuthorizationHandler`.
2. Why is `AuthorizationHandlerContext.HasSucceeded` false if even one requirement remains in `_pendingRequirements`?
3. How can you use a custom `IAuthorizationPolicyProvider` to support dynamic, database-driven permissions?
4. What happens if two different handlers are registered for the same requirement and one calls `Succeed()` while the other calls `Fail()`?
