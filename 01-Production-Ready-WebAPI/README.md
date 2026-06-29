# Challenge 01 — Building a Production-Ready Web API

> **Sprint 01**
>
> Estimated Duration: **7 Days**
>
> Estimated Effort: **22–28 Hours**
>
> Difficulty: ⭐⭐⭐☆☆
>
> Target Level:
>
> Senior Software Engineer → Senior+ / Staff Foundation

---

# Challenge Overview

Welcome to the first challenge of the Principal Engineer Academy.

This is **not** another CRUD Web API tutorial.

You are going to design and implement the foundation of an enterprise-grade ASP.NET Core Web API as if you were the Principal Engineer responsible for defining the engineering standards of an organization.

The goal is not simply to make the API work.

The goal is to make it survive years of development.

Every decision you make throughout this challenge must answer one question:

> **"Would I still make this decision if this project had 100 developers and millions of users?"**

If the answer is "No",

then the design should be reconsidered.

---

# Story

Congratulations.

You have just joined **Nova Commerce**, a rapidly growing retail company.

The company currently consists of:

- 15 developers
- 2 QA engineers
- 1 DevOps engineer
- 1 Product Owner

The first version of the platform must be delivered within three months.

The CTO asks you a simple question:

> "Can we build a foundation that we will not regret after two years?"

Your answer will define the future of the engineering team.

---

# Mission

Your mission is to design and build the initial architecture of the platform.

The API must be:

- Clean
- Secure
- Maintainable
- Observable
- Testable
- Cloud Ready
- Performance Aware

You are **NOT** allowed to optimize for today only.

You must optimize for future growth.

---

# Business Context

Nova Commerce sells products online.

Version 1 of the platform supports:

- Products
- Customers
- Orders
- Authentication

Future versions will include:

- Payments
- Notifications
- Inventory
- Search
- AI Assistant
- Recommendation Engine

Your architecture should allow future expansion without major redesign.

---

# Learning Goals

By the end of this challenge you should understand:

## Architecture

- Clean Architecture

- Separation of Concerns

- SOLID

- Layering

- Dependency Rule

---

## ASP.NET Core

- Middleware

- Dependency Injection

- Configuration

- Logging

- Validation

- Exception Handling

- Problem Details

---

## REST

- Resource Design

- HTTP Status Codes

- Idempotency

- Versioning

- Pagination

---

## Runtime

- Request Pipeline

- Async Programming

- Lifetime Management

---

## Production Readiness

- Health Checks

- Configuration Providers

- Environment Configuration

- Structured Logging

- Secure Defaults

---

# Deliverables

By the end of this challenge you should have

✅ Production Ready Solution Structure

✅ Clean Architecture

✅ REST API

✅ Global Exception Handling

✅ Structured Logging

✅ Validation

✅ Health Checks

✅ Swagger

✅ Configuration System

✅ Dependency Injection

---

# Folder Structure

The expected solution structure should look similar to:

/src

    NovaCommerce.API

    NovaCommerce.Application

    NovaCommerce.Domain

    NovaCommerce.Infrastructure

/tests

    NovaCommerce.UnitTests

    NovaCommerce.IntegrationTests

/docs

---

# Engineering Principles

Throughout this academy we follow several principles.

## Principle 1

Always understand **WHY** before **HOW**.

---

## Principle 2

Never introduce complexity without a measurable benefit.

---

## Principle 3

Every abstraction has a cost.

---

## Principle 4

Performance is a feature.

---

## Principle 5

Readability is more valuable than cleverness.

---

## Principle 6

Code should communicate intent.

---

## Principle 7

Architecture exists to reduce future cost.

---

# Expected Mindset

Do NOT ask

> "How do I implement this?"

Instead ask

> "Should I implement this?"

---

Do NOT ask

> "Which design pattern can I use?"

Ask

> "Do I need a design pattern?"

---

Do NOT ask

> "How can I make this generic?"

Ask

> "Should this even be generic?"

---

# What You Will NOT Learn

This challenge intentionally avoids

- Microservices

- Kubernetes

- Distributed Messaging

- Azure Functions

- Event Sourcing

Not because they are unimportant,

but because a weak monolith becomes an even weaker distributed system.

---

# Success Criteria

At the end of this sprint you should be able to explain:

Why Clean Architecture?

Why not Layered Architecture?

Why Middleware instead of Filters?

Why Typed HttpClient?

Why ProblemDetails?

Why Validation should not live in Controllers?

Why Logging is an architectural concern?

---

# Final Challenge

At the end of Sprint 1,

I should be able to ask you any design question related to ASP.NET Core Web APIs,

and your answer should focus on

**engineering decisions**

rather than

**framework APIs**.

That is the first step toward becoming a Principal Software Engineer.