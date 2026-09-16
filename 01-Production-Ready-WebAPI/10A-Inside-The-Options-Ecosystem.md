# 10A - The Options Ecosystem

> "An option is not an object.
>
> It is the result of a collaboration between multiple runtime components."

---

# Why This Chapter Exists

Suppose your application contains

```json
{
  "Storage": {
    "Container": "images",
    "RetryCount": 3
  }
}
```

A service simply asks for

```csharp
IOptions<StorageOptions>
```

Seems easy.

But...

Where did this object come from?

Who created it?

Who bound it?

Who validated it?

Who cached it?

Who updates it?

Who disposes it?

Answering those questions is the real purpose of this chapter.

---

# The Complete Journey

One configuration value travels through an entire runtime pipeline.

```
appsettings.json

        │

        ▼

JsonConfigurationProvider

        │

        ▼

ConfigurationRoot

        │

        ▼

ConfigurationBinder

        │

        ▼

OptionsFactory<T>

        │

        ▼

Validation

        │

        ▼

Options Cache

        │

        ▼

IOptions<T>

        │

        ▼

Dependency Injection

        │

        ▼

Business Service
```

Understanding this pipeline explains the entire Options ecosystem.

---

# Startup

Program.cs executes.

```csharp
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection("Storage"));
```

Most developers think

StorageOptions

was registered.

Not true.

Instead,

ASP.NET Core registers

many infrastructure services.

Something close to

```
OptionsFactory<T>

OptionsMonitor<T>

OptionsManager<T>

OptionsCache<T>

ConfigurationChangeTokenSource<T>

ConfigureNamedOptions<T>
```

One line of code.

Multiple runtime services.

---

# Composition Root

Notice something important.

Business code never creates

StorageOptions.

Only the Composition Root knows

how options are constructed.

Exactly like Dependency Injection.

---

# ConfigurationBinder

When StorageOptions is requested,

the Binder maps

```
Storage:Container

↓

StorageOptions.Container
```

```
Storage:RetryCount

↓

StorageOptions.RetryCount
```

No business logic.

No validation.

Only mapping.

---

# Source Code Expedition

One of the key classes is

```
OptionsFactory<T>
```

Simplified,

its responsibility is approximately

```csharp
Create(name)

↓

Create empty object

↓

Run all Configure()

↓

Run all PostConfigure()

↓

Validate()

↓

Return object
```

Notice

Factory does not cache.

Factory only creates.

Single Responsibility Principle.

---

# Why Factory?

Imagine

configuration changes.

A cached object

cannot magically update itself.

Instead,

the runtime creates

a completely new object.

Factories make this inexpensive and predictable.

---

# Configure()

Every registration

adds another configuration action.

Example

```
Configure Storage

↓

Configure Retry

↓

Configure Encryption

```

OptionsFactory executes

all of them

in registration order.

This enables extension

without modification.

Classic Open/Closed Principle.

---

# PostConfigure()

Sometimes

configuration depends

on previous configuration.

Example

```
Container missing?

↓

Generate default value.
```

Rather than changing Configure(),

ASP.NET Core executes

PostConfigure()

after all configuration is complete.

---

# Validation

Next,

validation runs.

Possible validators

```
DataAnnotations

↓

Custom Validators

↓

ValidateOnStart()
```

If validation fails,

option creation fails.

No invalid object enters the application.

---

# Why Validation Happens Here

Notice the order.

```
Configuration

↓

Binding

↓

PostConfigure

↓

Validation
```

Validation must happen last.

Otherwise,

PostConfigure()

could modify already validated values.

---

# Options Cache

Creating objects repeatedly

would waste CPU.

Instead,

ASP.NET Core caches options.

Simplified

```
Request

↓

Need Options

↓

Cache?

↓

Yes

↓

Return Existing
```

Otherwise

```
Create

↓

Validate

↓

Cache

↓

Return
```

---

# `OptionsMonitorCache<T>`

Internally,

Monitor stores

current options

inside

```
OptionsMonitorCache<T>
```

Think of it as

```
Dictionary

Name

↓

Options Object
```

When configuration changes,

cache entries are replaced.

Not modified.

Immutability greatly simplifies thread safety.

---

# `IOptions<T>`

Internally

```
OptionsManager<T>

↓

OptionsFactory<T>

↓

Cache

↓

Value
```

One object.

Application lifetime.

---

# `IOptionsSnapshot<T>`

Different design.

Every HTTP request

creates

a fresh snapshot.

```
Request

↓

Scope

↓

OptionsFactory

↓

Snapshot
```

Two requests

may receive

different values.

Perfect for

reload-on-change scenarios

inside MVC.

---

# `IOptionsMonitor<T>`

Monitor combines

Factory

+

Cache

+

Change Tokens.

```
Configuration Changed

↓

Change Token Fires

↓

Remove Cache

↓

Create New Object

↓

Notify Subscribers
```

No polling.

Everything is event-driven.

---

# Source Code Expedition

OptionsMonitor

roughly behaves like

```text
Configuration Changed

↓

Invalidate Cache

↓

Factory.Create()

↓

Store New Value

↓

Invoke Callbacks
```

Notice

Subscribers receive

new immutable objects.

Never partially updated objects.

---

# OnChange()

Suppose

BackgroundWorker

needs new retry settings.

```csharp
_monitor.OnChange(options =>
{
    ...
});
```

Internally

OptionsMonitor subscribes

to

IChangeToken.

Everything flows naturally.

---

# Why Immutable Objects?

Suppose

one thread

changes

RetryCount

while another thread

reads it.

Race condition.

Instead,

ASP.NET Core creates

a new immutable object.

Readers always receive

consistent state.

---

# Named Options

Internally

cache key

is not only

```
Type
```

It is

```
(Type, Name)
```

Example

```
StorageOptions

↓

Images

Documents

Backups
```

Three independent instances.

Same class.

---

# Thread Safety

Reads happen constantly.

Configuration changes

rarely.

Therefore

runtime optimizes

for reads.

Creating

a new immutable object

is cheaper

than synchronizing

thousands of concurrent readers.

---

# Source Code Expedition

Look into

```
OptionsFactory<T>

OptionsManager<T>

OptionsMonitor<T>

OptionsMonitorCache<T>

OptionsCache<T>

OptionsBuilder<T>
```

Notice something.

Every class owns

one responsibility.

No giant manager class.

The ecosystem itself follows SOLID.

---

# Trade-off Analysis

Question

Why not update

StorageOptions

in place?

Possible.

But...

Problems

- Thread safety
- Partial updates
- Lock contention
- Complex synchronization
- Race conditions

Instead

Create New Object

↓

Replace Reference

↓

Notify Consumers

Simple.

Fast.

Safe.

---

# Another Trade-off

Why not bind configuration

every time

Value is requested?

Because

binding uses reflection.

Reflection isn't free.

ASP.NET Core pays

the cost

only when needed.

---

# Design Patterns

The Options ecosystem uses several patterns together.

Factory

```
OptionsFactory<T>
```

Observer

```
IChangeToken

OnChange()
```

Decorator

```
Validation pipeline
```

Builder

```
OptionsBuilder<T>
```

Cache

```
OptionsMonitorCache<T>
```

None of these patterns are obvious when using

```csharp
builder.Services.Configure<T>()
```

Yet all of them collaborate behind the scenes.

---

# The Entire Ecosystem

```
Program.cs

        │

        ▼

Configuration

        │

        ▼

Binder

        │

        ▼

OptionsFactory

        │

        ▼

Configure()

        │

        ▼

PostConfigure()

        │

        ▼

Validation

        │

        ▼

Cache

        │

        ▼

Options Interface

        │

        ▼

Dependency Injection

        │

        ▼

Business Service

        │

        ▼

Application Logic
```

Every component owns exactly one responsibility.

No component knows the implementation details of another.

That is deliberate architecture.

---

# Principal Thinking

Junior Engineer:

"I injected IOptions."

Senior Engineer:

"I know when to use IOptionsMonitor."

Principal Engineer:

"I understand why the runtime separates creation, validation, caching, monitoring and delivery into independent components."

That understanding allows you to design your own extensible frameworks.

---

# Architecture Lessons

The Options ecosystem demonstrates several important architectural ideas.

- Composition over inheritance.
- Small focused services.
- Immutability for thread safety.
- Event-driven updates.
- Separation of creation and caching.
- Open/Closed through registration pipelines.
- Infrastructure hidden behind abstractions.

These ideas apply far beyond configuration.

They are patterns for building maintainable systems.

---

# Self Assessment

You have mastered this chapter if you can explain:

- Why Configure<T>() registers many services instead of one.
- Why OptionsFactory does not cache objects.
- Why validation runs after PostConfigure().
- Why OptionsMonitor replaces objects instead of mutating them.
- How IChangeToken enables live updates.
- Why immutable options simplify concurrency.
- Which design patterns appear throughout the Options ecosystem.
- How a single value travels from appsettings.json to a business service.

If you can draw the complete lifecycle of an Options object—from configuration source to dependency injection—and justify each design decision, you've moved beyond using the Options Pattern. You understand the architecture that makes it work.