# 09 - Configuration

> "Configuration is not about storing values.
>
> It is about separating software from its environment."

---

# Why Should a Principal Engineer Care?

Imagine you deploy exactly the same application to five different environments.

Developer Machine

↓

Integration

↓

UAT

↓

Staging

↓

Production

Should you compile the application five times?

Of course not.

The software is the same.

Only the environment changes.

Configuration exists to separate

**Application**

from

**Environment**

---

# Production Story

Friday.

6:30 PM.

The Production deployment succeeds.

Ten minutes later...

Every API returns

```
500 Internal Server Error
```

Database is healthy.

Azure is healthy.

Code hasn't changed.

The problem?

Someone accidentally deployed

```
appsettings.Development.json
```

to Production.

The application connected to a database that doesn't exist.

Nothing was wrong with the code.

Everything was wrong with the configuration.

---

# The Problem Before Configuration

Imagine this code.

```csharp
public class ProductRepository
{
    private const string ConnectionString =
        "Server=SQL01;Database=Sales;...";
}
```

Looks simple.

Until...

The application moves to Azure.

Now SQL Server changes.

Connection String changes.

Every deployment requires code changes.

Worse,

someone commits production credentials into Git.

Now the problem isn't technical.

It's a security incident.

---

# The Principle

Ask yourself:

> "Is this value part of my business logic?"

If the answer is **No**

it probably belongs in Configuration.

Examples

Configuration

✔ Connection Strings

✔ API Keys

✔ Storage Accounts

✔ SMTP Servers

✔ Feature Flags

✔ Retry Counts

✔ Timeout Values

✔ Cache Duration

Business Logic

✘ VAT Percentage Calculation

✘ Discount Rules

✘ Order Status Workflow

Those belong to the Domain.

---

# Configuration is a Hierarchy

ASP.NET Core doesn't read

```
appsettings.json
```

It builds a **Configuration Tree**.

Think of it like this:

```
Configuration Root

├── ConnectionStrings
│      └── Default
│
├── Azure
│      └── Storage
│
├── Logging
│      └── LogLevel
│
└── Features
       └── EnablePayments
```

Every provider contributes values.

The application reads only one unified tree.

---

# Configuration Providers

ASP.NET Core supports multiple sources.

Examples

```
appsettings.json

↓

appsettings.Environment.json

↓

User Secrets

↓

Environment Variables

↓

Azure Key Vault

↓

Command Line

↓

Custom Providers
```

Notice something important.

The application does not know where the value came from.

Only IConfiguration knows.

---

# Provider Precedence

Providers are evaluated in order.

Later providers override earlier ones.

Example

```
appsettings.json

↓

Environment Variables

↓

Command Line
```

Suppose

appsettings.json

```
Timeout = 30
```

Environment Variable

```
Timeout = 60
```

The application receives

```
60
```

No code changes.

No recompilation.

---

# IConfiguration

At runtime,

ASP.NET Core builds one object.

```
ConfigurationRoot
```

Internally,

it contains

```
Provider 1

Provider 2

Provider 3

Provider 4
```

When you ask

```csharp
_configuration["Timeout"]
```

ASP.NET Core walks the providers

from highest priority

to lowest priority.

The first matching value wins.

---

# Configuration vs Options

Many developers inject

```csharp
IConfiguration
```

everywhere.

This is usually a design smell.

Business Services should not know

where configuration lives.

Instead

bind configuration

once

into strongly typed objects.

```
PaymentSettings

StorageSettings

EmailSettings

RetrySettings
```

Now services depend on

business configuration,

not configuration infrastructure.

---

# Strongly Typed Configuration

Instead of

```csharp
_configuration["Azure:Storage:Container"]
```

Prefer

```csharp
StorageOptions.Container
```

Advantages

✔ Compile-time safety

✔ IntelliSense

✔ Easier testing

✔ Refactoring support

✔ Validation

✔ Clear documentation

Strings become models.

---

# Environment Variables

Cloud-native applications prefer

Environment Variables.

Why?

Because infrastructure owns configuration.

Not developers.

Example

```
ASPNETCORE_ENVIRONMENT

ConnectionStrings__Default

Azure__Storage__Account
```

Notice

```
__
```

represents

```
:
```

inside configuration paths.

---

# Secrets

Never store

```
Passwords

API Keys

Certificates

Tokens
```

inside

```
appsettings.json
```

Production secrets belong in

- Azure Key Vault
- AWS Secrets Manager
- HashiCorp Vault

Configuration and Secret Management are related,

but they are not the same concern.

---

# Feature Flags

Suppose Marketing wants to enable a new checkout experience.

Do you redeploy?

No.

Configuration changes.

Application behavior changes.

Feature Flags are configuration,

not business rules.

---

# Reload on Change

JSON configuration supports

```
reloadOnChange
```

The file changes.

Configuration reloads.

Depending on how the application consumes configuration,

the new values may become available immediately.

This is one reason the Options Pattern exists.

(We'll explore that in the next chapter.)

---

# Common Mistakes

❌ Inject IConfiguration into every service.

❌ Store business rules in configuration.

❌ Store secrets in Git.

❌ Duplicate configuration values.

❌ Use magic strings throughout the codebase.

❌ Assume appsettings.json is the only provider.

---

# Configuration in Azure

Typical Production Flow

```
Application

↓

Azure App Configuration (optional)

↓

Azure Key Vault

↓

Environment Variables

↓

appsettings.json
```

The farther a value is from source code,

the easier it is to change without redeployment.

---

# Production Incident

A team stores

```
PaymentProvider = Stripe
```

inside configuration.

Later,

Finance requests:

Premium customers use Stripe.

Enterprise customers use Adyen.

Now payment selection depends on customer type.

That is no longer configuration.

It is business logic.

Moving business rules into configuration made the system harder to understand.

---

# Design Guidelines

Ask these questions before adding a new configuration value.

Does it change between environments?

↓

Configuration.

---

Does Operations own it?

↓

Configuration.

---

Does the business own it?

↓

Probably Domain.

---

Will changing it require redeployment?

↓

Maybe it should be configuration instead.

---

# Principal Thinking

Junior Engineer:

"Where should I put the connection string?"

Senior Engineer:

"Should this value come from IConfiguration?"

Principal Engineer:

"Who owns this decision—the business, the application, or the infrastructure?"

Ownership determines architecture.

Not convenience.

---

# Architecture Insight

Configuration is an Infrastructure concern.

Business logic should not know

whether values came from:

- JSON
- Azure
- Environment Variables
- Key Vault

Business code consumes **intent**,

not **configuration providers**.

That separation keeps the application portable.

---

# Self Assessment

You have mastered this chapter if you can explain:

- Why Configuration is an architectural concern.
- Why appsettings.json is only one provider.
- How provider precedence works.
- Why IConfiguration should rarely leave the composition root.
- Why strongly typed options are preferable.
- Which values belong in configuration and which belong in the Domain.
- How cloud-native applications manage configuration differently from local development.

If you can design a configuration strategy for a multi-environment cloud application without coupling business logic to infrastructure, you've moved beyond reading configuration—you've started treating it as part of the system architecture.