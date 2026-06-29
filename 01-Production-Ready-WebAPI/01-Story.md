# Story

# Friday 9:42 AM

Nova Commerce is preparing to launch its new online retail platform.

The company has recently secured funding and expects rapid growth over the next 18 months.

The engineering team currently consists of:

- 15 Backend Engineers
- 6 Frontend Engineers
- 2 QA Engineers
- 1 DevOps Engineer
- 1 Product Owner
- 1 Engineering Manager

You have just joined the company as the first Principal Software Engineer.

Everyone is excited.

Everyone is moving fast.

Everyone wants to start coding.

But you ask one question.

> "What kind of system are we trying to build?"

Silence.

Nobody has the answer.

---

# The Problem

The team already started implementing APIs.

Every developer is using his own style.

Examples:

Developer A

```
ProductsController
```

Developer B

```
ProductsApi
```

Developer C

```
ProductEndpoint
```

---

One developer returns

```
200
```

Another returns

```
201
```

Another always returns

```
500
```

Some APIs validate data.

Others don't.

Some log errors.

Others don't.

Some catch exceptions.

Others let the application crash.

Everything works...

Until it doesn't.

---

# Three Months Later...

The project has grown.

There are now

- 120 Controllers

- 400 Endpoints

- 70 Services

- 40 Repositories

Developers are afraid to modify existing code.

Every deployment introduces new bugs.

The logging format changes from one endpoint to another.

Configuration exists in

- appsettings.json

- Azure

- Environment Variables

- Hardcoded Constants

Nobody knows which configuration is actually used.

---

# Six Months Later

Customers begin reporting issues.

Example

Order creation fails randomly.

The support team cannot reproduce it.

Developers search the logs.

Some logs look like this

```
Error occurred
```

Others

```
Exception
```

Others

```
Something failed
```

No correlation id.

No request id.

No user id.

No order id.

No trace id.

Nobody knows which request produced the error.

---

# Nine Months Later

Traffic increases.

The application starts consuming more memory.

Requests become slower.

Developers immediately begin adding

```
async
```

everywhere.

Performance becomes even worse.

Nobody understands why.

---

# Twelve Months Later

Management asks

"Can we split the application into Microservices?"

The engineering team answers

"No."

Not because Microservices are difficult.

Because the Monolith itself has no architecture.

Splitting chaos only creates distributed chaos.

---

# Why This Challenge Exists

Many engineers learn

ASP.NET Core

Controllers

Dependency Injection

Middleware

Configuration

Logging

Validation

...

as isolated topics.

Professional software engineering doesn't work like that.

Every technology exists because someone had a problem.

Throughout this challenge,

we will first understand

the problem.

Then

the constraints.

Then

the trade-offs.

Only then

will we implement the solution.

---

# The Business Requirements

Version 1 of Nova Commerce must support

## Customer Management

- Register customer

- Update profile

- View profile

---

## Product Catalog

- Browse products

- Product details

- Categories

- Search

---

## Orders

- Create order

- Cancel order

- View order history

---

## Authentication

- Login

- Logout

- Refresh Token

---

# Non-Functional Requirements

These are far more important than CRUD endpoints.

The platform must be

## Availability

99.9%

---

## Performance

Average response time

< 250 ms

---

## Scalability

Support

100 requests/sec today

1000 requests/sec next year

without major redesign.

---

## Maintainability

New developers should understand the codebase within one week.

---

## Security

Sensitive information must never appear in logs.

---

## Observability

Every request must be traceable.

---

## Testability

Business logic should be testable without HTTP.

---

# Technical Constraints

The CTO has imposed several constraints.

- ASP.NET Core

- SQL Server

- Azure

- Azure App Service

- Azure Key Vault

- Azure Application Insights

No Kubernetes.

No Microservices.

No Event Bus.

No Redis.

No Service Bus.

Not yet.

The first objective is

Build a strong foundation.

---

# Your Responsibilities

As Principal Engineer,

your job is NOT to write the most code.

Your job is to make sure

future engineers

can safely write code.

That means

Architecture

Standards

Guidelines

Naming

Observability

Performance

Maintainability

become more important than

Controllers.

---

# Success Definition

At the end of this challenge,

the project should be ready for

50 developers

without requiring

a complete rewrite.

---

# Principal Thinking

A Senior Engineer asks

> "How do I implement a Controller?"

A Principal Engineer asks

> "How should every Controller inside this company look?"

---

A Senior Engineer asks

> "How do I log this exception?"

A Principal Engineer asks

> "How do I make logging consistent across the entire platform?"

---

A Senior Engineer asks

> "How can I inject this service?"

A Principal Engineer asks

> "How should dependency management work for the next five years?"

That difference in thinking is exactly what this academy is designed to develop.