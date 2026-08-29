# Solution Architecture

> Challenge 01
>
> Architecture Decision Record (ADR-001)

---

# Purpose

This document records the architectural decisions made before writing the first line of production code.

The purpose is **not** to prove that one architecture is universally superior.

The purpose is to explain why a particular architecture is the most appropriate solution **for this specific business context**.

Architecture is always context-dependent.

---

# Problem Statement

Nova Commerce is preparing to launch Version 1 of its retail platform.

The company expects:

- Rapid feature development.
- A growing engineering team.
- Long-term maintainability.
- Cloud deployment.
- Increasing business complexity.

The architecture chosen today should reduce future cost rather than optimize only for today's simplicity.

---

# Decision Drivers

Every architectural decision is evaluated against the following priorities.

| Driver | Priority | Why it matters |
|---------|----------|----------------|
| Maintainability | ⭐⭐⭐⭐⭐ | The project will live for years. |
| Simplicity | ⭐⭐⭐⭐⭐ | Complexity slows teams more than computers. |
| Testability | ⭐⭐⭐⭐⭐ | Business rules must be independently testable. |
| Flexibility | ⭐⭐⭐⭐ | Business requirements will evolve. |
| Performance | ⭐⭐⭐⭐ | Must support growth without premature optimization. |
| Security | ⭐⭐⭐⭐ | Security cannot depend on developer discipline. |
| Developer Experience | ⭐⭐⭐⭐ | Consistency reduces onboarding time. |

---

# Candidate Architectures

Before selecting an architecture, we evaluate realistic alternatives.

---

# Option A — Traditional Layered Architecture

```
Controller

↓

Service

↓

Repository

↓

Database
```

Advantages

- Easy to understand.
- Fast to start.
- Familiar to most developers.

Disadvantages

- Business logic often leaks across layers.
- Tight coupling.
- Difficult testing.
- Large services over time.
- Repository pattern frequently becomes an unnecessary abstraction.

Decision

Suitable for small applications.

Not ideal for a platform expected to evolve for years.

---

# Option B — Clean Architecture

```
Presentation

↓

Application

↓

Domain

↓

Infrastructure
```

Advantages

- Business rules become framework independent.
- High testability.
- Excellent separation of concerns.
- Infrastructure can evolve independently.
- Easy onboarding.

Disadvantages

- More projects.
- More abstractions.
- Slightly higher initial complexity.

Decision

Excellent balance for our current business goals.

---

# Option C — Vertical Slice Architecture

```
Feature

↓

Commands

↓

Queries

↓

Handlers

↓

Infrastructure
```

Advantages

- Feature-oriented.
- Excellent for CQRS.
- Reduces coupling between features.

Disadvantages

- More files.
- Better suited once business complexity increases.
- Requires stronger architectural discipline.

Decision

Excellent candidate for future evolution.

Not selected for Version 1.

---

# Option D — Microservices

Advantages

- Independent deployment.
- Independent scaling.
- Team autonomy.

Disadvantages

Everything else.

Additional complexity:

- Networking
- Distributed transactions
- Monitoring
- Deployment
- Authentication
- Versioning
- Event consistency
- DevOps

Decision

Rejected.

The organization has not yet reached the complexity required to justify Microservices.

A poorly designed Monolith becomes an even worse Distributed System.

---

# Selected Architecture

We choose

## Clean Architecture

combined with

- Dependency Injection
- REST APIs
- Modular Folder Structure
- Feature Organization inside the Application Layer

This provides the best balance between:

- Simplicity
- Maintainability
- Growth
- Testability

---

# Proposed Solution

```
                    Client

                       │

                       ▼

                ASP.NET Core API

                       │

             Middleware Pipeline

                       │

                       ▼

                 Application Layer

              Commands / Queries

                       │

                       ▼

                 Domain Layer

             Business Rules Only

                       │

                       ▼

             Infrastructure Layer

      SQL Server / Azure / External APIs
```

---

# Dependency Rule

Dependencies must always point inward.

```
Presentation

↓

Application

↓

Domain

Infrastructure
```

The Domain Layer must know nothing about:

- ASP.NET Core
- SQL Server
- Azure
- EF Core
- Logging Frameworks

The business should survive framework changes.

---

# Project Structure

```
src/

    NovaCommerce.Api

    NovaCommerce.Application

    NovaCommerce.Domain

    NovaCommerce.Infrastructure

tests/

    UnitTests

    IntegrationTests

docs/

```

Each project has a single responsibility.

---

# Responsibilities

## API

Responsible for

- HTTP
- Authentication
- Middleware
- Dependency Injection
- Configuration

Nothing more.

---

## Application

Responsible for

- Use Cases
- Validation
- DTOs
- Business Workflow

Should not know SQL.

Should not know Azure.

---

## Domain

Responsible only for

Business Rules.

Contains

- Entities

- Value Objects

- Domain Services

- Domain Events (future)

The Domain Layer should be the most stable project in the solution.

---

## Infrastructure

Responsible for

- EF Core

- Blob Storage

- Azure

- Email

- External APIs

Infrastructure changes frequently.

Business rules should not.

---

# Why This Architecture?

Notice something interesting.

We did NOT choose Clean Architecture because:

> "Everyone uses it."

We selected it because it satisfies our architectural drivers.

Maintainability

★★★★★

Testability

★★★★★

Cloud Readiness

★★★★★

Business Isolation

★★★★★

Complexity

★★★★☆

This is engineering.

Not fashion.

---

# Trade-offs

Every architecture has costs.

Clean Architecture introduces

- More projects
- More abstractions
- More interfaces
- More dependency injection

Those costs are acceptable because the expected lifetime of the project is measured in years.

If this were a two-week internal tool,

I would not choose this architecture.

---

# Future Evolution

Version 2

- CQRS

Version 3

- MediatR (optional)

Version 4

- Background Processing

Version 5

- Messaging

Version 6

- Distributed Services

Notice

The architecture grows gradually.

Not by rewriting.

---

# Common Mistakes

❌ Creating interfaces for everything.

❌ Generic Repository everywhere.

❌ Business logic inside Controllers.

❌ EF Core entities exposed through APIs.

❌ Infrastructure references leaking into Domain.

❌ Choosing Microservices because they are popular.

---

# Principal Thinking

A Senior Engineer asks

> "Which architecture should we use?"

A Principal Engineer asks

> "Which business problem does this architecture solve?"

Those two questions produce completely different systems.

---

# Architecture Review Checklist

Before implementation begins, verify:

✅ Business requirements are understood.

✅ Quality attributes are prioritized.

✅ Dependencies point inward.

✅ Domain has zero infrastructure references.

✅ Controllers contain no business logic.

✅ Infrastructure is replaceable.

✅ Business logic is testable.

If all answers are "Yes",

implementation may begin.