# Learning Objectives

> Challenge 01
>
> Building a Production-Ready ASP.NET Core Web API

---

# Why This Document Exists

One of the biggest mistakes engineers make is measuring progress by:

✔ Number of videos watched

✔ Number of articles read

✔ Number of completed courses

Unfortunately...

None of these measure engineering ability.

Professional growth is measured by one question:

> **"What engineering decisions can I confidently make today that I couldn't make yesterday?"**

This document defines exactly what "success" looks like for Challenge 01.

---

# Learning Philosophy

Throughout this academy every topic has five learning levels.

You do NOT move to the next level until you master the previous one.

```
Level 1
Understand

↓

Level 2
Implement

↓

Level 3
Analyze

↓

Level 4
Optimize

↓

Level 5
Principal Thinking
```

---

# Level 1 — Understand

Goal

Understand

- What problem does this technology solve?
- Why does it exist?
- What would happen if it didn't exist?

You should be able to explain concepts without looking at documentation.

Examples

Middleware

You should explain

Why ASP.NET Core uses middleware instead of HttpModules.

NOT

How to write middleware.

---

Dependency Injection

You should explain

Why Dependency Injection exists.

NOT

How to call AddScoped().

---

Validation

You should explain

Why validation should not live inside Controllers.

NOT

How ValidationAttribute works.

---

Definition of Done

You can explain every concept in simple engineering language.

Without code.

---

# Level 2 — Implement

Goal

Build everything yourself.

No copy/paste.

No ChatGPT.

No templates.

Implementation Targets

✔ Clean Architecture

✔ Dependency Injection

✔ Middleware

✔ Logging

✔ Configuration

✔ Validation

✔ Health Checks

✔ Swagger

✔ Global Exception Handling

---

Definition of Done

You can build a production-ready API from scratch.

Without searching.

---

# Level 3 — Analyze

Most developers stop at implementation.

Principal Engineers start here.

Goal

Understand

How ASP.NET Core works internally.

Topics

Request Pipeline

Middleware Execution

Service Provider

Dependency Graph

Configuration Loading

Logging Pipeline

Options Pattern

Problem Details

Controller Activation

Request Lifetime

Cancellation Tokens

Object Lifetime

Memory Allocation

Thread Usage

Garbage Collection Impact

---

Definition of Done

You can explain

"What happens internally"

when an HTTP request reaches the application.

Step by step.

---

# Level 4 — Optimize

Now assume the application is already running in production.

Your job changes.

Goal

Improve

Performance

Reliability

Maintainability

Security

Examples

Should this service be Singleton?

Why?

---

Should logging be synchronous?

---

Should we validate inside Middleware?

---

Should we use FluentValidation?

---

Should every exception be logged?

---

Should Swagger be enabled in Production?

---

Definition of Done

You can justify every engineering decision.

Using measurable arguments.

Not opinions.

---

# Level 5 — Principal Thinking

This is where the real learning begins.

Your goal is no longer

Writing code.

Your goal becomes

Creating standards.

Instead of asking

"How do I implement Logging?"

You ask

"How should logging work across 200 APIs?"

---

Instead of

"Should I use Middleware?"

You ask

"What architectural rule determines whether we use Middleware, Filters or Endpoint Filters?"

---

Instead of

"How do I validate input?"

You ask

"How can we ensure every API validates requests consistently without developer discipline?"

---

Definition of Done

You are able to write an Engineering Guideline that another team can follow.

---

# Skill Matrix

| Topic | Understand | Implement | Analyze | Optimize | Principal |
|----------|-------------|--------------|--------------|--------------|--------------|
| Clean Architecture | ✅ | ✅ | ✅ | ✅ | ✅ |
| SOLID | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dependency Injection | ✅ | ✅ | ✅ | ✅ | ✅ |
| Middleware | ✅ | ✅ | ✅ | ✅ | ✅ |
| Configuration | ✅ | ✅ | ✅ | ✅ | ✅ |
| Options Pattern | ✅ | ✅ | ✅ | ✅ | ✅ |
| Logging | ✅ | ✅ | ✅ | ✅ | ✅ |
| Validation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exception Handling | ✅ | ✅ | ✅ | ✅ | ✅ |
| REST | ✅ | ✅ | ✅ | ✅ | ✅ |
| Health Checks | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Principal Success Criteria

At the end of this challenge you should be capable of answering questions such as:

Why Clean Architecture?

Why not Vertical Slice?

Why Middleware instead of Filters?

Why Typed HttpClient?

Why not Generic Repository?

Why Options Pattern?

Why ProblemDetails?

Why should validation be centralized?

Why should logging be structured?

Why is configuration an architectural concern?

If your answers depend on

"I always do this..."

or

"This is the Microsoft recommendation..."

then you have NOT yet reached the Principal level.

A Principal Engineer understands

trade-offs.

---

# Self Assessment

Rate yourself from 1 to 5.

| Topic | Score |
|------------|----------|
| Architecture | |
| SOLID | |
| Middleware | |
| DI | |
| Logging | |
| Configuration | |
| Validation | |
| REST | |
| Exception Handling | |
| Health Checks | |

---

# Exit Criteria

You should not move to Challenge 02 until:

✅ You can explain every architectural decision.

✅ You can build the solution from memory.

✅ You understand the ASP.NET Core Request Pipeline.

✅ You understand dependency lifetimes.

✅ You understand configuration precedence.

✅ You understand structured logging.

✅ You understand why every layer exists.

If any answer is uncertain...

Stay in this challenge.

Depth is always more valuable than speed.