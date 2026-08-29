# 05 - Clean Architecture

> "Good architecture is not about layers.
>
> It is about protecting business rules from change."
>
> — Inspired by Robert C. Martin

---

# Why Should a Principal Engineer Care?

A Principal Engineer is rarely judged by the amount of code they write.

Instead, they are judged by the amount of future pain they prevent.

Architecture is one of the few engineering decisions that continues to influence a project years after the original developers have left.

Choosing an architecture is not about elegance.

It is about reducing the long-term cost of change.

---

# The Problem We Are Trying to Solve

Let's forget ASP.NET Core for a moment.

Imagine we start with the simplest possible implementation.

```

ProductController

↓

ProductService

↓

ProductRepository

↓

SQL Server

```

Everything works.

The project is only 2,000 lines of code.

Everyone is happy.

---

Three months later...

Business asks for:

- Blob Storage
- Email Notifications
- Redis Cache
- Search
- Azure Service Bus

The code slowly becomes

```

Controller

↓

Service

↓

Repository

↓

Repository

↓

Repository

↓

External APIs

↓

Azure

↓

Blob

↓

Email

↓

SQL

```

Your Service now contains

- Business Rules

- SQL Logic

- Logging

- Validation

- Blob Storage

- Cache

- Email

- Retry Logic

- Transactions

One class.

800 lines.

No one wants to touch it.

---

# The Real Problem

Notice something important.

The problem is NOT SQL Server.

The problem is NOT ASP.NET Core.

The real problem is **coupling**.

Business rules have become dependent on implementation details.

Whenever infrastructure changes...

Business code changes.

That should never happen.

---

# The Principle Behind Clean Architecture

Instead of asking

> "Where should this code live?"

Ask

> "What does this code know?"

This single question changes everything.

---

# The Dependency Rule

The most important rule in Clean Architecture is:

> Source code dependencies must always point toward business rules.

Never the opposite.

Business rules should not know anything about:

- SQL Server
- Entity Framework
- ASP.NET Core
- Azure
- Blob Storage
- RabbitMQ
- Logging Frameworks

These are implementation details.

Business rules should survive replacing all of them.

---

# Thinking in Circles

Clean Architecture organizes software by **stability**, not by technology.

```
                +----------------------+
                |   Presentation       |
                | Controllers / APIs   |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |   Application        |
                | Use Cases            |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |      Domain          |
                | Business Rules       |
                +----------+-----------+
                           ^
                           |
                +----------------------+
                | Infrastructure       |
                | EF Core, Azure, SQL  |
                +----------------------+
```

Notice something unusual.

Infrastructure depends on Domain.

Domain does NOT depend on Infrastructure.

This often feels backwards to new developers.

It is exactly what gives the architecture its flexibility.

---

# Responsibilities of Each Layer

## Domain

Contains:

- Entities
- Value Objects
- Business Invariants
- Domain Services (when necessary)

Should never contain:

- DbContext
- ILogger
- IConfiguration
- HttpContext
- Azure SDK
- EF Core Attributes

If the Domain project references `Microsoft.AspNetCore.*`, something is wrong.

---

## Application

Represents business use cases.

Examples:

CreateOrder

CancelOrder

UpdateProduct

ApproveInvoice

The Application layer orchestrates work.

It should answer:

"What should happen?"

It should NOT answer:

"How is it stored?"

---

## Infrastructure

Everything that talks to the outside world.

Examples:

- SQL Server
- Blob Storage
- Email
- Azure Key Vault
- Redis
- HTTP APIs

Infrastructure changes frequently.

Business logic should not.

---

## Presentation

Responsible only for transport.

Controllers should:

Receive request.

Validate basic format.

Call Application.

Return response.

Nothing else.

If business logic exists inside Controllers,

the architecture is already leaking.

---

# A Practical Example

Suppose the business rule says:

> A customer cannot place an order if their account is suspended.

Where should this rule live?

Wrong answers:

❌ Controller

❌ Repository

❌ SQL Trigger

Correct answer:

✅ Domain

Because the rule belongs to the business.

Not to HTTP.

Not to SQL.

---

Now suppose we decide to expose the same functionality through:

- REST API
- gRPC
- Azure Function
- Background Worker

Should the business rule change?

No.

Only the Presentation layer changes.

That is exactly what Clean Architecture protects.

---

# Common Misconceptions

## "Clean Architecture Requires Many Projects"

No.

It requires clear boundaries.

You can implement it in one project for a small application.

Multiple projects are an implementation detail.

---

## "Everything Needs an Interface"

No.

Interfaces exist to invert dependencies—not to satisfy a pattern.

Ask:

"Will another layer depend on this abstraction?"

If not, don't create one.

---

## "Repository Pattern Is Mandatory"

No.

Repository is a pattern.

Not a law.

With EF Core, using DbContext directly in the Infrastructure layer is often sufficient.

Introducing a Generic Repository that simply wraps EF Core usually adds no value.

---

# Trade-offs

| Benefit | Cost |
|---------|------|
| High testability | More structure |
| Business isolation | More files |
| Easier maintenance | Slight learning curve |
| Replaceable infrastructure | Initial setup effort |
| Clear responsibilities | Requires discipline |

Clean Architecture is not free.

It exchanges **initial complexity** for **long-term stability**.

---

# Decision Guide

Before adding a class, ask:

### Does it contain business rules?

→ Domain

---

### Does it coordinate a use case?

→ Application

---

### Does it talk to SQL, Azure, HTTP or Files?

→ Infrastructure

---

### Does it receive HTTP requests?

→ Presentation

---

If you cannot answer these questions clearly,

the class probably has more than one responsibility.

---

# Production Incident

A company decides to migrate from SQL Server to PostgreSQL.

### Project A

Business logic is mixed with Entity Framework.

Migration takes six months.

Hundreds of files change.

---

### Project B

Business logic depends only on abstractions.

Only Infrastructure changes.

Migration completes in three weeks.

---

Both projects use the same database.

The difference is architecture.

---

# Principal Thinking

A Senior Engineer asks:

> "Where should I put this class?"

A Principal Engineer asks:

> "If we replace SQL Server, which classes should remain untouched?"

That question reveals whether the architecture is truly protecting the business.

---

# Self-Assessment

You have mastered this chapter if you can confidently answer:

- Why does the Domain layer avoid infrastructure dependencies?
- Why is the Dependency Rule more important than the number of layers?
- When is Clean Architecture not the right choice?
- Why isn't Generic Repository always a good idea?
- How would you explain Clean Architecture to a new team member without drawing the diagram first?

If you can answer these questions with examples—not definitions—you've moved beyond memorization into engineering understanding.