# 09A - Configuration Providers Internals

> "Configuration is not a file.
>
> It is a runtime graph composed from multiple providers."

---

# Why This Chapter Exists

Most developers think:

```
appsettings.json

↓

IConfiguration
```

Reality is far more interesting.

```
JSON

Environment Variables

Azure Key Vault

User Secrets

Command Line

Custom Providers

↓

Configuration Builder

↓

Configuration Root

↓

Configuration Providers

↓

Configuration Tree

↓

IConfiguration
```

Everything you read through IConfiguration comes from this runtime pipeline.

---

# The Three Questions

To truly understand Configuration, answer three questions:

1. How does ASP.NET Core combine multiple configuration sources?

2. How does one provider override another?

3. How does reloadOnChange update values while the application is running?

Everything else builds upon these answers.

---

# Startup Phase

During startup,

Program.cs executes.

Simplified:

```csharp
var builder = WebApplication.CreateBuilder(args);
```

Internally,

the Generic Host creates a ConfigurationBuilder.

Initially,

it contains no values.

Only an empty list of providers.

Think of it like this:

```
ConfigurationBuilder

Providers

[]

```

No JSON.

No Environment Variables.

Nothing.

---

# Adding Providers

Every call such as

```csharp
builder.Configuration.AddJsonFile(...)
```

does not read the file immediately.

Instead,

it registers a provider factory.

```
ConfigurationBuilder

↓

Provider Factory

↓

JSON Provider

```

The same happens for

Environment Variables

Command Line

Key Vault

User Secrets

Each source contributes

one provider.

---

# Build()

Eventually,

ConfigurationBuilder.Build()

is executed.

This changes everything.

Pseudo-code

```text
foreach(source)

↓

Build Provider

↓

Load()

↓

Store Provider
```

Only now are configuration values actually loaded.

Until Build(),

nothing has been read.

---

# ConfigurationRoot

The result of Build()

is

```
ConfigurationRoot
```

Internally

it looks approximately like

```
ConfigurationRoot

Providers

------------------------

JsonProvider

EnvironmentProvider

KeyVaultProvider

CommandLineProvider

```

ConfigurationRoot owns

all providers.

Providers own

their values.

---

# Inside a Provider

Every provider exposes

roughly

```csharp
IDictionary<string,string?>
```

Notice something surprising.

Configuration is flattened.

Not hierarchical.

Example

```
Logging

LogLevel

Default
```

becomes

```
Logging:LogLevel:Default
```

Everything is stored as key/value pairs.

Hierarchy is reconstructed later.

---

# Why Flatten?

Consider

```
Azure

↓

Storage

↓

ConnectionString
```

Internally

```
Azure:Storage:ConnectionString
```

Simple keys provide

- Faster lookup
- Easier merging
- Consistent provider implementation

Different providers only need to supply strings.

---

# Reading Configuration

Suppose

```csharp
_configuration["Storage:Container"]
```

What happens?

ConfigurationRoot

asks providers

in reverse registration order.

Pseudo-code

```text
CommandLine

?

No

↓

Environment

?

No

↓

KeyVault

?

Yes

↓

Return Value
```

Search stops immediately.

This is provider precedence.

---

# Why Reverse?

Because later providers are expected to override earlier providers.

Imagine

```
appsettings.json

↓

Production Environment Variable

```

Production should win.

Not JSON.

Therefore,

the newest provider has highest priority.

---

# Visualizing Provider Resolution

```
ConfigurationRoot

        │

        ▼

Command Line

        │

        ▼

Environment Variables

        │

        ▼

Azure Key Vault

        │

        ▼

appsettings.json
```

The first matching key wins.

---

# Sections

Suppose

```
Storage

Container

Images
```

Internally

there are no objects.

Only

```
Storage:Container

↓

Images
```

When you call

```csharp
GetSection("Storage")
```

ASP.NET Core creates

a lightweight view

over matching keys.

Sections are projections.

Not separate storage.

---

# Configuration Binder

Suppose

```csharp
StorageOptions
```

Binding works approximately like

```
Configuration

↓

Reflection

↓

Properties

↓

Assign Values

↓

Options Object
```

The binder

does not know

business logic.

It simply maps names.

---

# Why Reflection Is Acceptable

Binding occurs

rarely.

Usually

once during startup

or

when Options reload.

Reflection cost is negligible here.

Request execution remains unaffected.

ASP.NET Core optimizes

the hot path.

Not startup.

---

# Reload on Change

Suppose

```
appsettings.json
```

changes.

How does ASP.NET Core know?

JSON Provider uses

```
FileSystemWatcher
```

The operating system reports

```
File Changed
```

↓

Provider Reload()

↓

ConfigurationRoot Reload()

↓

ChangeToken Triggered

↓

OptionsMonitor Updated

No polling.

No timers.

Everything is event-driven.

---

# IChangeToken

This small interface powers

configuration reload.

Think of it as

an observable notification.

```
Provider

↓

Change Token

↓

Subscribers

↓

Reload
```

Many parts of ASP.NET Core use

IChangeToken,

not only configuration.

---

# Custom Provider

Suppose your company stores configuration

inside SQL Server.

You can implement

```
ConfigurationProvider

↓

Load()

↓

Set Data

```

Now

```
_configuration["Feature:Payments"]
```

works

without the application knowing

SQL exists.

This is Open/Closed Principle applied to configuration.

---

# Azure Key Vault Provider

Internally

Key Vault behaves

like every other provider.

Difference

only

in Load().

Instead of

reading JSON,

it calls Azure.

Once loaded,

ConfigurationRoot treats it identically.

That uniform abstraction is one of the strengths of the design.

---

# Thread Safety

ConfigurationRoot

supports concurrent reads.

Reads happen constantly.

Writes are rare.

The implementation favors

fast reads

over frequent updates.

Exactly what production systems require.

---

# Why IConfiguration Is Read-Only

Notice

there is no

```csharp
_configuration.Set(...)
```

Why?

Configuration represents

environment state.

Not application state.

Business code should consume configuration.

Not modify it.

Changing configuration at runtime belongs to infrastructure.

---

# Performance

Configuration lookup is inexpensive.

However,

avoid

```
_configuration["Key"]
```

inside hot loops.

Read once.

Bind once.

Inject strongly typed options.

This reduces

string lookups

and improves maintainability.

---

# Reading the Source

Interesting classes

```
ConfigurationBuilder

ConfigurationRoot

ConfigurationProvider

JsonConfigurationProvider

EnvironmentVariablesConfigurationProvider

ConfigurationBinder
```

Notice how small most classes are.

Each one owns

one responsibility.

The architecture itself follows SOLID.

---

# Principal Thinking

Junior Engineer:

"Where does IConfiguration get its values?"

Senior Engineer:

"Why do Environment Variables override JSON?"

Principal Engineer:

"How can we add a new configuration source without changing the framework?"

That last question explains why providers exist.

---

# Architecture Insight

Configuration in ASP.NET Core is a textbook example of the Open/Closed Principle.

New providers

Database

Azure

Consul

Vault

Kubernetes

Encrypted Files

can all integrate

without modifying ConfigurationRoot.

The framework grows

through extension,

not modification.

---

# Self Assessment

You have mastered this chapter if you can explain:

- Why ConfigurationBuilder stores sources before Build().
- What ConfigurationRoot actually contains.
- Why providers flatten keys.
- How precedence works internally.
- Why ConfigurationRoot searches providers in reverse order.
- How reloadOnChange uses FileSystemWatcher and IChangeToken.
- How ConfigurationBinder creates strongly typed objects.
- How you would implement a custom configuration provider.

If you can sketch the complete configuration pipeline—from Program.cs to ConfigurationRoot to Providers to Options binding—you no longer think of configuration as a JSON file. You understand it as a composable runtime subsystem.