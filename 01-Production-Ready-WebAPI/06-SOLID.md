# 06 - SOLID Principles

> "SOLID is not a design pattern.
>
> It is not a checklist.
>
> It is a set of forces that help software survive change."

---

# Why Should a Principal Engineer Care?

A Senior Engineer writes code that solves today's problem.

A Principal Engineer designs systems that continue solving tomorrow's problems without rewriting yesterday's work.

SOLID is not about making code "clean".

It is about reducing the cost of future change.

Every principle exists because engineers repeatedly suffered from the same type of design failure.

---

# Before We Learn SOLID

Let's review a piece of production code.

```

ProductService

```

```csharp
public class ProductService
{
    private readonly ProductDbContext _db;
    private readonly BlobStorageService _blob;
    private readonly EmailService _email;
    private readonly ILogger<ProductService> _logger;

    public async Task CreateProduct(ProductDto dto)
    {
        if(string.IsNullOrWhiteSpace(dto.Name))
            throw new Exception();

        var entity = new Product();

        entity.Name = dto.Name;

        entity.ImageUrl =
            await _blob.Upload(dto.Image);

        _db.Products.Add(entity);

        await _db.SaveChangesAsync();

        await _email.NotifyAdmin(entity);

        _logger.LogInformation("Product Created");
    }
}
```

Looks fine.

Application works.

Feature delivered.

Sprint completed.

Everyone is happy.

Until...

---

# Six Months Later

Business requirements change.

Now the company needs

- Azure Blob Storage

- AWS S3

- Local Storage

depending on customer subscription.

---

Marketing asks for

SMS notification.

---

Security asks for

Audit Logs.

---

Finance asks for

Premium Products.

---

Compliance asks for

Soft Delete.

---

ProductService becomes

```

1300 Lines

```

Every sprint introduces more

if

else

switch

try

catch

feature flags

configuration

logging

validation

notifications

The class becomes impossible to understand.

---

# The Real Problem

The issue is NOT bad developers.

The issue is that one class became responsible for many independent reasons to change.

That is exactly what SOLID tries to prevent.

---

# SOLID Overview

Instead of memorizing five principles,

think of them as five questions.

| Principle | Principal Question |
|------------|-------------------|
| S | Why would this class change? |
| O | How can we extend behavior without modifying stable code? |
| L | Can this abstraction truly replace its parent? |
| I | Are consumers forced to depend on things they don't use? |
| D | Who owns the dependency? |

SOLID is a way of asking better design questions.

---

# S — Single Responsibility Principle

### Common Misunderstanding

People often say

> "A class should do one thing."

This is misleading.

A class may perform many operations.

The real rule is

> A class should have one reason to change.

---

## Example

Imagine

InvoiceService

Responsibilities

- Validate invoice

- Calculate tax

- Save to SQL

- Upload PDF

- Send Email

- Log Events

How many departments can ask for changes?

Finance

Accounting

DevOps

Marketing

Infrastructure

Operations

Each department changes the same class.

This is architectural coupling.

---

## Better Design

```

InvoiceValidator

↓

InvoiceCalculator

↓

InvoiceRepository

↓

InvoicePdfGenerator

↓

InvoiceNotificationService

↓

InvoiceService (Coordinator)

```

Now each class changes for one reason.

Not one method.

One business responsibility.

---

# O — Open / Closed Principle

Software should be

Open for Extension

Closed for Modification

---

Suppose discounts are calculated like this

```csharp
if(customer.Type == Premium)
{
    ...
}

if(customer.Type == Gold)
{
    ...
}

if(customer.Type == Platinum)
{
    ...
}
```

Every new customer type

changes existing code.

Eventually,

every release touches the same file.

Conflict.

Merge Issues.

Regression Bugs.

---

Better

```text
IDiscountStrategy

↓

PremiumDiscount

GoldDiscount

StudentDiscount

EmployeeDiscount

```

New behavior.

No existing code modified.

That is OCP.

---

# L — Liskov Substitution Principle

Perhaps the most misunderstood principle.

It is NOT about inheritance.

It is about behavior.

Question

Can I replace

Base

with

Derived

without changing program correctness?

---

Bad Example

```
Bird

↓

Penguin
```

Bird

```
Fly()
```

Penguin

```
throw NotSupportedException()
```

The abstraction was wrong.

Not Penguin.

---

Production Example

Suppose

IPaymentProvider

contains

Refund()

Capture()

Authorize()

Now someone creates

CashPaymentProvider

Refund?

Impossible.

Authorization?

Not supported.

The abstraction lied.

---

A good abstraction never forces fake implementations.

---

# I — Interface Segregation Principle

Large interfaces spread coupling.

Example

```
IProductService

Create()

Delete()

Search()

Export()

Import()

Archive()

Publish()

```

A reporting module only needs Search().

Yet it depends on everything.

---

Better

```

IProductSearch

IProductWriter

IProductExporter

IProductPublisher

```

Consumers depend only on what they use.

---

# D — Dependency Inversion Principle

The most important principle for Clean Architecture.

High-level policies

should not depend on

low-level details.

---

Wrong

```

OrderService

↓

SqlRepository

```

Now business depends on SQL.

---

Better

```

OrderService

↓

IOrderRepository

↓

SqlRepository

```

Now SQL depends on business.

Not the opposite.

This enables

Testing

Cloud Migration

Infrastructure Replacement

without touching business rules.

---

# SOLID and Clean Architecture

Notice something interesting.

Clean Architecture is almost impossible without SOLID.

SRP

creates focused classes.

OCP

allows growth.

LSP

creates trustworthy abstractions.

ISP

reduces coupling.

DIP

enables dependency direction.

SOLID is the engine.

Clean Architecture is one possible destination.

---

# When NOT to Apply SOLID Aggressively

Principal Engineers avoid dogma.

Do NOT create

10 interfaces

for

10 tiny classes.

Do NOT create Strategy Pattern

when there are only two cases that will never change.

Do NOT split every class into five services.

Abstractions have maintenance cost.

Every interface introduces another decision.

---

# Production Review Checklist

Ask these questions during every code review.

### SRP

How many departments could request changes to this class?

---

### OCP

Will adding a feature require modifying stable code?

---

### LSP

Can every implementation safely replace its abstraction?

---

### ISP

Does every consumer use every member?

---

### DIP

Is business logic depending on technology?

---

# Production Incident

A payment system supports

Visa

MasterCard

PayPal

Stripe

Apple Pay

Google Pay

Each new provider requires editing

PaymentService.cs

Eventually

the file exceeds 2500 lines.

Releases become risky.

Bug fixes introduce regressions.

The issue wasn't complexity.

The issue was violating OCP.

---

# Principal Thinking

Junior Engineers memorize SOLID.

Senior Engineers apply SOLID.

Principal Engineers know when NOT to apply SOLID.

That distinction matters.

Over-engineering is just as dangerous as poor design.

Good architecture is not measured by the number of abstractions.

It is measured by the cost of future change.

---

# Self Assessment

You have mastered this chapter if you can answer:

- Why is "one reason to change" more accurate than "one thing"?
- When does OCP increase complexity unnecessarily?
- Can you identify an LSP violation without looking for inheritance?
- How do ISP and SRP reinforce each other?
- Why is DIP the foundation of Clean Architecture?
- Can you justify *not* introducing an abstraction?

If you can answer these questions using examples from real projects, you've moved beyond knowing SOLID—you've started using it as an engineering decision-making tool.