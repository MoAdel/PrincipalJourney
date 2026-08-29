# System Requirements

> Challenge 01
>
> Building a Production-Ready Web API

---

# Why This Document Exists

One of the most common mistakes in software engineering is choosing an architecture before understanding the system.

A Principal Engineer works in the opposite direction.

He starts with the business.

Then the constraints.

Then the quality attributes.

Only then comes the architecture.

Architecture is not a goal.

Architecture is the consequence of good decisions.

---

# The Real Mission

Our task is NOT to build a Web API.

Our task is to build a software platform capable of supporting a growing business.

This distinction changes every engineering decision.

---

# Business Vision

Nova Commerce is a B2B and B2C retail platform.

The company expects rapid growth during the next two years.

Current customers:

≈ 5,000

Expected customers after two years:

≈ 500,000

Current engineering team:

15 developers

Expected engineering team:

60+ developers

The architecture should support this growth without major redesign.

---

# Functional Requirements

Version 1 must provide the following capabilities.

## Customer Management

- Register Customer
- Login
- Update Profile
- Change Password
- View Customer Details

---

## Product Catalog

- List Products
- Product Details
- Categories
- Search
- Pagination
- Filtering
- Sorting

---

## Orders

- Create Order

- View Order

- Cancel Order

- Order History

---

## Authentication

- Login

- Refresh Token

- Logout

---

# Non-Functional Requirements

These requirements are significantly more important than CRUD operations.

---

## Availability

Target

99.9%

The application should recover gracefully from failures.

---

## Performance

Average Response Time

< 250 ms

95th percentile

< 500 ms

---

## Scalability

The platform should support:

Current

100 Requests / Second

Target

1000 Requests / Second

without changing the overall architecture.

---

## Reliability

Unexpected exceptions should never expose internal implementation details.

The client should always receive a predictable error contract.

---

## Maintainability

A new engineer should understand the solution within one week.

This requirement influences every architectural decision.

---

## Observability

Every request should be traceable.

Every failure should be diagnosable.

Every deployment should be measurable.

If an issue occurs in production, the engineering team should identify the root cause without attaching a debugger.

---

## Security

Sensitive information must never appear in:

- Logs
- URLs
- Exception Messages
- HTTP Responses

Secrets must never be stored inside source code.

---

## Testability

Business logic should be executable without ASP.NET Core.

Controllers should contain almost no business logic.

---

## Cloud Readiness

The application should be deployable to Azure without architectural changes.

Configuration should support multiple environments.

---

# Architectural Decision Drivers

This section defines the forces that drive our architectural choices.

Every future decision should satisfy these priorities.

| Priority | Driver | Importance |
|----------|----------|------------|
| 1 | Maintainability | ⭐⭐⭐⭐⭐ |
| 2 | Simplicity | ⭐⭐⭐⭐⭐ |
| 3 | Testability | ⭐⭐⭐⭐⭐ |
| 4 | Performance | ⭐⭐⭐⭐ |
| 5 | Security | ⭐⭐⭐⭐ |
| 6 | Scalability | ⭐⭐⭐⭐ |
| 7 | Deployment Simplicity | ⭐⭐⭐ |
| 8 | Cost | ⭐⭐⭐ |

Notice something important.

Scalability is NOT Priority #1.

Premature optimization destroys more projects than traffic.

---

# Constraints

Every project has constraints.

Ignoring them creates unrealistic architectures.

Current constraints:

✔ ASP.NET Core

✔ SQL Server

✔ Azure App Service

✔ Azure Storage

✔ Azure Key Vault

✔ Azure Application Insights

---

Not allowed (Version 1)

❌ Kubernetes

❌ Microservices

❌ Redis

❌ Event Bus

❌ Message Broker

❌ Distributed Cache

Why?

Because these technologies solve problems we do not have yet.

Adding them now increases complexity without measurable value.

---

# Assumptions

The following assumptions are currently valid.

- Single SQL Database

- Single Web API

- Stateless Application

- Cloud Deployment

- HTTPS Only

- REST APIs

If these assumptions change later,

our architecture should adapt,

not collapse.

---

# Risks

Every architecture contains risks.

Ignoring them does not eliminate them.

## Risk 1

Business requirements change.

Mitigation

Keep business logic independent from frameworks.

---

## Risk 2

Team size doubles.

Mitigation

Enforce architectural conventions.

---

## Risk 3

Traffic increases.

Mitigation

Avoid unnecessary coupling.

---

## Risk 4

Cloud migration evolves.

Mitigation

Separate infrastructure concerns.

---

# Success Metrics

The project will be considered successful if:

✔ New features require minimal modification.

✔ Developers can work independently.

✔ Bugs are easy to diagnose.

✔ Production failures are observable.

✔ Business logic remains isolated.

✔ Testing remains inexpensive.

---

# What We Are Optimizing For

Not

"The fastest API."

Not

"The cleanest code."

Not

"The most design patterns."

We optimize for

**Engineering Sustainability.**

If this codebase survives five years of growth,

then our architecture was successful.

---

# Principal Reflection

Before writing the first line of code, ask yourself:

"If I leave this company tomorrow, will the remaining engineers thank me for the architecture I designed?"

If the answer is uncertain,

don't start coding yet.

Improve the design first.