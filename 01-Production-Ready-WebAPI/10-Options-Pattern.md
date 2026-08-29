# 10 - Options Pattern

> "Configuration tells the application what values exist.
>
> Options tell the application what those values mean."

---

# Why This Chapter Exists

Imagine a large application.

You open a service.

```csharp
public class StorageService
{
    private readonly IConfiguration _configuration;
}
```

Another service.

```csharp
public class PaymentService
{
    private readonly IConfiguration _configuration;
}
```

Another.

```csharp
public class EmailService
{
    private readonly IConfiguration _configuration;
}
```

Soon,

every service depends on IConfiguration.

The business layer now knows

about configuration infrastructure.

This violates one of the most important architectural principles.

Business code should depend on business concepts.

Not infrastructure.

---

# The Real Problem

Suppose you need

Azure Blob Storage.

The configuration looks like this.

```json
{
    "Storage": {
        "Account": "...",
        "Container": "images",
        "RetryCount": 3
    }
}
```

Without Options,

every service reads

```csharp
_configuration["Storage:Container"]

_configuration["Storage:RetryCount"]

_configuration["Storage:Account"]
```

Problems appear immediately.

- Magic strings
- No IntelliSense
- Runtime errors
- Difficult testing
- Duplicate lookups
- Configuration scattered everywhere

The application still works.

The architecture slowly degrades.

---

# The Principle

Configuration belongs to Infrastructure.

Business Services should receive

business configuration.

Not configuration providers.

Instead of

```
IConfiguration
```

inject

```
StorageOptions
```

or

```
IOptions<StorageOptions>
```

The service no longer knows

where values came from.

Only what they represent.

---

# Options Class

Instead of strings,

create a model.

```csharp
public sealed class StorageOptions
{
    public string Account { get; init; }

    public string Container { get; init; }

    public int RetryCount { get; init; }
}
```

Notice

No framework dependency.

No IConfiguration.

No attributes.

Only business intent.

---

# Binding

During startup

```
Configuration

↓

ConfigurationBinder

↓

StorageOptions

↓

Dependency Injection

```

The application performs binding once.

Services receive ready-to-use objects.

---

# Registration

```csharp
builder.Services
    .Configure<StorageOptions>(
        builder.Configuration.GetSection("Storage"));
```

This line does much more than it appears.

It does NOT register StorageOptions directly.

It registers an entire Options pipeline.

We'll explore that in the next chapter.

---

# Why Not Register StorageOptions Directly?

Imagine

```csharp
builder.Services.AddSingleton(storageOptions);
```

Works.

Until...

Configuration changes.

ReloadOnChange triggers.

Your singleton never updates.

The Options ecosystem exists specifically to solve problems like this.

---

# Validation

Configuration errors should appear

at startup.

Not

during customer requests.

Example

```csharp
public sealed class StorageOptions
{
    [Required]
    public string Container { get; init; }

    [Range(1,10)]
    public int RetryCount { get; init; }
}
```

Now invalid configuration becomes

a startup failure.

Fail Fast.

---

# IOptions<T>

```
Singleton

↓

One Value

↓

Never Changes
```

Suitable when

configuration is static.

Examples

Connection Strings

Application Name

Fixed Limits

---

# IOptionsSnapshot<T>

Think

```
One Snapshot

↓

Per HTTP Request
```

Request A

↓

Configuration V1

Request B

↓

Configuration V2

Useful for

ASP.NET Core request processing.

Scoped lifetime.

---

# IOptionsMonitor<T>

Think

```
Application Running

↓

Configuration Changes

↓

Subscribers Notified

↓

CurrentValue Updated
```

Ideal for

Background Services

Long-running processes

Caching

Feature Flags

---

# Choosing the Correct Interface

| Situation | Use |
|------------|-----|
| Static Configuration | IOptions<T> |
| Request-specific Refresh | IOptionsSnapshot<T> |
| Live Updates | IOptionsMonitor<T> |

Notice

The decision is driven

by lifetime.

Not convenience.

---

# Why Three Interfaces?

Different applications

have different consistency requirements.

Some values

should never change.

Others

should update

per request.

Others

should update immediately.

One interface could not satisfy all three efficiently.

Architecture created specialization.

---

# Lifetime Relationship

```
IOptions<T>

Singleton

----------------

IOptionsSnapshot<T>

Scoped

----------------

IOptionsMonitor<T>

Singleton

with change notifications
```

Notice

The lifetime aligns with the intended usage.

This is not accidental.

---

# Validation Strategies

Option 1

DataAnnotations

Good

Simple

---

Option 2

Custom Validation

Best for

Business-specific rules.

---

Option 3

ValidateOnStart()

Highly recommended

Production applications should fail before serving traffic.

---

# Named Options

Suppose the application connects to

two storage accounts.

```
Images

Documents
```

Both use

StorageOptions.

Named Options allow

multiple independent configurations

using the same type.

This avoids duplicate models.

---

# Common Mistakes

❌ Inject IConfiguration everywhere.

❌ Store business rules inside options.

❌ Ignore validation.

❌ Inject IOptionsMonitor when values never change.

❌ Read configuration repeatedly inside hot paths.

❌ Create dozens of tiny options classes.

Group configuration

by responsibility.

---

# Production Story

A payment provider requires

RetryCount.

Developer stores

```
RetryCount = 0
```

inside Production configuration.

Application starts.

First payment request.

Infinite retry loop avoided,

but every payment fails immediately.

The issue wasn't code.

The issue was invalid configuration.

Had ValidateOnStart() been enabled,

deployment would have failed.

Customers would never notice.

---

# Design Guidelines

Before creating a new Options class,

ask:

Does this represent one coherent responsibility?

Will these values change together?

Will another module need them?

Can the object be validated?

If not,

reconsider the design.

---

# Principal Thinking

Junior Engineer:

"How do I read this value?"

Senior Engineer:

"Should I use IOptions or IConfiguration?"

Principal Engineer:

"Who owns this configuration, and what lifetime should it have?"

That question determines

which Options abstraction is appropriate.

---

# Architecture Insight

The Options Pattern is not about configuration.

It is about dependency direction.

Business Services depend on

strongly typed intent.

Infrastructure depends on

Configuration Providers.

The two never meet directly.

That separation keeps the architecture clean.

---

# Self Assessment

You have mastered this chapter if you can explain:

- Why IConfiguration should rarely leave the Composition Root.
- Why Options improve architecture rather than just readability.
- When to use IOptions, IOptionsSnapshot and IOptionsMonitor.
- Why lifetime determines the correct interface.
- Why validation belongs at startup.
- How Named Options reduce duplication.
- Why Options classes should represent cohesive responsibilities.

If you can design a configuration strategy where business services never know about IConfiguration yet still support validation and runtime updates, you've understood the real purpose of the Options Pattern.