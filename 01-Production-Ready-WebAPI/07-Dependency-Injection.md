# 07 - Dependency Injection

> "Dependency Injection is not about dependency injection.
>
> It is about dependency management."

---

# Why Should a Principal Engineer Care?

Most developers know how to write

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
```

Very few understand what actually happens afterwards.

A Principal Engineer should understand:

- How services are discovered
- How objects are created
- How lifetimes affect memory
- Why scopes exist
- Why Singleton bugs are dangerous
- Why DI affects architecture
- Why the container is NOT a Service Locator

Understanding the container changes how you design applications.

---

# Production Story

Monday.

08:30 AM.

Production API starts throwing random exceptions.

```
Cannot consume scoped service
from singleton.
```

The deployment passed.

The code compiled.

Unit tests passed.

Yet production is failing.

Why?

Because Dependency Injection is not validated by the compiler.

It is validated by object lifetimes.

---

# The Problem Before Dependency Injection

Imagine this controller.

```csharp
public class OrdersController
{
    private readonly OrderService _service =
        new OrderService(
            new SqlOrderRepository(),
            new EmailService(),
            new BlobStorageService());
}
```

Looks harmless.

Until...

Marketing changes EmailService.

Infrastructure changes BlobStorage.

Database changes Repository.

Every consumer changes.

Dependencies explode.

Testing becomes almost impossible.

The controller owns object creation.

Instead of business logic.

---

# The Principle

Classes should describe

what they need.

Not

how to build it.

Wrong

```csharp
var repository = new SqlRepository();
```

Correct

```csharp
public OrderService(IOrderRepository repository)
```

Notice something important.

OrderService doesn't care

how

repository is created.

That responsibility belongs elsewhere.

---

# What is Dependency Injection?

Dependency Injection is a technique where an object's dependencies are provided from the outside instead of being created internally.

The object simply declares:

"I need an IOrderRepository."

Someone else decides:

- Which implementation
- When to create it
- How long it should live
- Whether it should be reused

---

# Dependency Injection vs IoC

These terms are often confused.

## Inversion of Control (IoC)

A design principle.

Control is inverted.

Instead of your code controlling object creation, an external component does.

---

## Dependency Injection (DI)

One implementation of IoC.

Dependencies are injected.

Usually through constructors.

DI is a technique.

IoC is the broader principle.

---

# Constructor Injection

Preferred approach.

```csharp
public class OrderService
{
    private readonly IOrderRepository _repository;

    public OrderService(
        IOrderRepository repository)
    {
        _repository = repository;
    }
}
```

Advantages

- Immutable dependencies
- Easy testing
- Explicit requirements
- Fail-fast construction

If a dependency is required, constructor injection should almost always be your first choice.

---

# How ASP.NET Core Builds Objects

When the application starts:

```
builder.Services
```

collects registrations.

Internally, every registration becomes something similar to:

```
ServiceDescriptor
```

Each descriptor stores:

- Service Type
- Implementation Type
- Lifetime
- Factory (optional)
- Instance (optional)

Think of it as a blueprint, not an object.

No service is created yet.

---

# Building the Service Provider

After registration completes:

```csharp
builder.Build();
```

ASP.NET Core creates a root container.

```
ServiceCollection

↓

ServiceProvider

↓

Object Graph

```

This ServiceProvider knows how to build every registered object.

Still...

No controller exists.

No DbContext exists.

No repository exists.

The container only knows *how* to create them.

---

# Request Pipeline

A request arrives.

```
HTTP Request

↓

Middleware

↓

Endpoint

↓

Controller

```

Controller needed.

The container asks:

```
What constructor does it have?
```

Suppose

```csharp
OrdersController(
    IOrderService service)
```

Container now needs

IOrderService.

OrderService constructor requires

```
IOrderRepository

ILogger

```

Repository requires

```
DbContext
```

DbContext requires

```
DbContextOptions
```

The container recursively builds the entire object graph.

This process is called

Object Graph Resolution.

---

# Visualizing the Object Graph

```
OrdersController
        │
        ▼
OrderService
    │       │
    ▼       ▼
Repository Logger
    │
    ▼
DbContext
    │
    ▼
DbContextOptions
```

The container walks this graph from top to bottom.

---

# Service Lifetimes

Choosing the wrong lifetime is one of the most common production issues.

---

## Transient

```
Every request for the service

↓

New instance
```

Use when

- Stateless
- Lightweight
- Cheap to create

Examples

Validators

Small utility services

Formatters

---

## Scoped

One instance

Per HTTP Request.

```
Request

↓

Scope

↓

Same instance reused
```

Examples

DbContext

Repositories

Business Services

---

## Singleton

One instance

For the lifetime of the application.

```
Application Starts

↓

One Instance

↓

All Requests Share It
```

Examples

Configuration

Caching Metadata

Static Lookup Tables

Feature Flags

---

# Lifetime Rules

Think from longest to shortest.

```
Singleton

↓

Scoped

↓

Transient
```

Allowed

Singleton → Singleton

Scoped → Scoped

Scoped → Transient

Transient → Scoped

Transient → Singleton

Not Allowed

Singleton

↓

Scoped

Because Singleton would keep a reference to a request-specific object.

Eventually leading to corrupted state.

---

# Why DbContext is Scoped

Imagine

100 Requests.

Each request

starts a transaction.

If DbContext were Singleton

every request would share:

- Change Tracker
- Transactions
- Entity State

Chaos.

Scoped isolates each request.

---

# Circular Dependencies

Example

```
OrderService

↓

CustomerService

↓

OrderService
```

The container cannot build the graph.

Result

```
Circular dependency detected.
```

Usually indicates poor design.

Not a DI limitation.

---

# ValidateScopes

Always enable scope validation during development.

It catches lifetime mistakes early.

Production bugs become development exceptions.

Fail fast.

---

# Performance Considerations

The built-in .NET container is highly optimized.

Object resolution is extremely fast.

However

Avoid:

- Registering unnecessary services
- Huge object graphs
- Heavy constructors
- Expensive Singleton initialization

Object creation is cheap.

Initialization is not.

---

# Common Mistakes

❌ Injecting IServiceProvider everywhere.

This is Service Locator.

Not Dependency Injection.

---

❌ Injecting 12 services into one class.

Usually indicates SRP violation.

---

❌ Using Singleton by default.

Singleton is not faster.

It simply lives longer.

---

❌ Creating service scopes manually without understanding why.

---

❌ Static helper classes replacing DI.

---

# Design Guidelines

Ask these questions before adding a dependency.

Does this class really need it?

Could another class own this responsibility?

Is this dependency stable?

Will the lifetime create hidden coupling?

---

# Production Incident

A Singleton service stores

HttpContext

received from a Scoped dependency.

Initially everything works.

Hours later

random users receive data belonging to different requests.

The bug is intermittent.

Difficult to reproduce.

The root cause?

A lifetime mismatch.

Not business logic.

---

# Principal Thinking

Junior Engineer:

"How do I inject ILogger?"

Senior Engineer:

"Which lifetime should this service use?"

Principal Engineer:

"Why does this dependency exist at all?"

Many dependency problems disappear when responsibilities are redesigned instead of registered.

---

# Architecture Insight

Dependency Injection is often mistaken as a framework feature.

It is not.

It is an architectural boundary.

The container should know

how to create objects.

The objects should not know

how they were created.

That separation keeps the application maintainable.

---

# Self Assessment

You have mastered this chapter if you can confidently answer:

- Why is constructor injection preferred?
- What is Object Graph Resolution?
- Why does ASP.NET Core delay object creation until needed?
- Why is DbContext Scoped instead of Singleton?
- Why does "Cannot consume scoped service from singleton" occur?
- What is the difference between IoC and DI?
- Why is IServiceProvider injection usually considered an anti-pattern?
- Can you explain how ASP.NET Core creates an OrdersController from an incoming HTTP request?

If you can explain the entire object creation process without looking at the framework documentation, you've moved beyond using Dependency Injection—you understand how the runtime itself composes your application.