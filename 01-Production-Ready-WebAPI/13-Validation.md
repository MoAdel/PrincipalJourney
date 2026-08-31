# 13 - Input Validation & Domain Invariants

> "Input validation protects your system from the outside world.
>
> Domain invariants protect your business from your own bugs."

---

# Why Should a Principal Engineer Care?

Validation is often reduced to slapping `[Required]` attributes on request DTOs.

```csharp
public class CreateCustomerRequest
{
    [Required]
    public string Name { get; set; }

    [EmailAddress]
    public string Email { get; set; }
}
```

This superficial approach creates four architectural disasters:

1. **Leaky Domain**: Validation logic is coupled to the HTTP presentation layer. If the same entity is created via a RabbitMQ consumer or CLI tool, validation is bypassed entirely.
2. **Scattered Business Invariants**: Complex business rules (e.g., "A customer cannot have more than 3 pending orders unless they are a VIP") are mixed with basic format checks (e.g., "Email is not null").
3. **ReDoS Vulnerabilities**: Unbounded regular expressions in validators can be exploited to cause 100% CPU lockups (Regular Expression Denial of Service).
4. **Inconsistent Error Formats**: Different endpoints return different validation error schemas, breaking mobile and web clients.

As a Principal Engineer, you structure validation into **three distinct layers with clear ownership, lifetime, and error semantics**.

---

# Production Story

Thursday.

04:30 PM.

Nova Commerce experiences a severe outage during a flash sale.

CPU utilization on all Web API nodes hits 100%. Latency climbs from 50ms to 45 seconds. Kestrel stops accepting new TCP connections.

### The Root Cause:
A developer added an email validation attribute using a naive regex:

```csharp
[RegularExpression(@"^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})$")]
public string Email { get; set; }
```

A bot sent 5,000 requests with malicious input strings containing repetitive special characters:

```
"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!@gmail.com"
```

The .NET regex engine experienced catastrophic backtracking (exponential $O(2^n)$ algorithmic complexity), pinning all CPU cores and starving the thread pool.

The outage was not caused by high traffic. It was caused by unvetted, synchronous input validation on the hot path.

---

# The Three Levels of Validation

A Principal Engineer separates validation into three strict architectural boundaries:

```
Incoming Request
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Input / Contract Validation (Application Layer)          │
│    • Is the JSON well-formed?                               │
│    • Is the email format valid?                             │
│    • Is the price greater than zero?                        │
│    • Tool: FluentValidation                                 │
│    • Output: 400 Bad Request / 422 Unprocessable Entity     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application / Cross-Entity Validation (Application Layer)│
│    • Does the referenced CustomerId exist in the database?  │
│    • Is the SKU in stock in this warehouse?                 │
│    • Tool: Application Services / CQRS Handlers             │
│    • Output: 404 Not Found / 409 Conflict                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Domain Invariants (Domain Layer)                         │
│    • Can an Order be Cancelled after it has Shipped?        │
│    • Is the total discount greater than the order subtotal? │
│    • Tool: Rich Domain Entities & Value Objects             │
│    • Output: Domain Result / Invariant Guard Violation      │
└─────────────────────────────────────────────────────────────┘
```

---

# Level 1: FluentValidation in Clean Architecture

Why use **FluentValidation** instead of `DataAnnotations`?

- **Separation of Concerns**: DTOs remain pure data containers without framework attributes.
- **Complex Validation Rules**: Supports conditional validation, custom rules, and async operations.
- **Testability**: Validators can be unit-tested in isolation without mocking HTTP contexts.

### The Request DTO:
```csharp
public sealed record CreateOrderRequest(
    Guid CustomerId,
    List<OrderItemDto> Items,
    string ShippingAddress,
    string? CouponCode);
```

### The FluentValidator:
```csharp
public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        // Stop on first failure per rule to save CPU
        RuleLevelCascadeMode = CascadeMode.Stop;

        RuleFor(x => x.CustomerId)
            .NotEmpty()
            .WithMessage("CustomerId is required.");

        RuleFor(x => x.Items)
            .NotEmpty()
            .WithMessage("Order must contain at least one item.")
            .Must(items => items.Count <= 100)
            .WithMessage("Order cannot exceed 100 distinct items.");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.Quantity)
                .GreaterThan(0)
                .LessThanOrEqualTo(1000);

            item.RuleFor(i => i.UnitPrice)
                .GreaterThan(0);
        });

        RuleFor(x => x.ShippingAddress)
            .NotEmpty()
            .MaximumLength(500);
    }
}
```

---

# Level 3: Domain Invariants in Rich Domain Entities

Domain entities should **never enter an invalid state**.

If an entity can be created with invalid state, your domain model is anemic and vulnerable to corruption.

### Value Object with Invariant Guards:
```csharp
public sealed class Money : ValueObject
{
    public decimal Amount { get; }
    public string Currency { get; }

    private Money(decimal amount, string currency)
    {
        Amount = amount;
        Currency = currency;
    }

    public static Result<Money, DomainError> Create(decimal amount, string currency)
    {
        if (amount < 0)
            return Result<Money, DomainError>.Failure(
                new DomainError("INVALID_AMOUNT", "Money amount cannot be negative."));

        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3)
            return Result<Money, DomainError>.Failure(
                new DomainError("INVALID_CURRENCY", "Currency must be a 3-letter ISO code."));

        return Result<Money, DomainError>.Success(new Money(amount, currency.ToUpperInvariant()));
    }
}
```

### Domain Entity Protecting Business Rules:
```csharp
public sealed class Order : AggregateRoot
{
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; }

    public Result<Unit, DomainError> Cancel()
    {
        if (Status == OrderStatus.Shipped)
        {
            return Result<Unit, DomainError>.Failure(
                new DomainError("CANNOT_CANCEL_SHIPPED_ORDER", "Shipped orders cannot be cancelled."));
        }

        Status = OrderStatus.Cancelled;
        return Result<Unit, DomainError>.Success(Unit.Value);
    }
}
```

---

# HTTP Status Codes: 400 vs 422 vs 409

A Principal Engineer establishes precise HTTP status code semantics for validation failures:

| Status Code | RFC Name | When to Return |
|---|---|---|
| **400** | Bad Request | Syntactic failure: Malformed JSON, unparseable GUID, invalid date format. |
| **422** | Unprocessable Entity | Semantic validation failure: JSON is valid, but input fields violate business constraints (e.g. Quantity is negative). |
| **404** | Not Found | Reference validation failure: Referenced foreign key does not exist (e.g. `CustomerId` not found). |
| **409** | Conflict | State validation failure: Invariant conflict (e.g. Email already registered, order already processed). |

---

# Performance & ReDoS Protection

When using Regular Expressions in validators:

### The Vulnerability:
```csharp
// DANGEROUS: Unbounded regex evaluation can hang CPU
RuleFor(x => x.Code).Matches(@"^[A-Z0-9]+$");
```

### The Principal Solution (.NET 7+ `[GeneratedRegex]` with Timeout):
```csharp
public static partial class RegexPatterns
{
    [GeneratedRegex(@"^[A-Z0-9]{3,20}$", RegexOptions.Compiled | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 100)]
    public static partial Regex ProductCodeRegex();
}
```

```csharp
RuleFor(x => x.Code)
    .Must(code => RegexPatterns.ProductCodeRegex().IsMatch(code))
    .WithMessage("Product code format is invalid.");
```

---

# Common Mistakes

❌ **Injecting DbContext into FluentValidators for Heavy Queries**
```csharp
// ANTI-PATTERN: Running complex SQL queries inside a validator during request binding
RuleFor(x => x.Email).MustAsync(async (email, ct) => await dbContext.Users.AnyAsync(u => u.Email == email));
```
✅ **Keep Validators Pure & Synchronous; Perform Database Checks in Application Services / Command Handlers.**

❌ **Automatic Validation Action Filters that Catch and Hide Validation Pipeline Execution**
```csharp
// Relying on obscure magic filters makes debugging request flow and error customization difficult.
```
✅ **Explicitly Validate in CQRS Pipeline Behaviors (e.g. MediatR `ValidationBehavior<TRequest, TResponse>`) or Minimal API Endpoint Filters.**

❌ **Allowing Invariant Validation in UI/DTO Only**
```csharp
// If an attacker bypasses the API and calls the domain service directly, invalid state is persisted.
```
✅ **Enforce Invariants Inside Domain Entities and Value Objects.**

---

# Architect's Decision

### Scenario
Nova Commerce needs an input and business validation architecture that scales across 100+ endpoints with consistent RFC 7807 problem details responses and zero domain layer coupling.

### Decision:
1. **Contract Validation**: FluentValidation registered in the Application layer as Singletons.
2. **Orchestration**: CQRS Validation Pipeline Behavior automatically validates requests before executing the command handler.
3. **Format**: Returns `422 Unprocessable Entity` formatted as RFC 7807 `ValidationProblemDetails` containing an `errors` dictionary grouped by property name.
4. **Domain Integrity**: All domain entities and value objects enforce internal invariants using private constructors and factory methods returning `Result<T, DomainError>`.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | DataAnnotations | "I added [Required] and [MaxLength] attributes to my request model." |
| **Senior** | FluentValidation | "I moved validation to FluentValidation rules in the application layer." |
| **Principal** | Multi-Tiered Integrity | "How are format validation, cross-aggregate integrity, and domain invariants separated? Are validators CPU-safe against ReDoS? Is validation reusable across HTTP, gRPC, and message brokers?" |

---

# Learning Resources & References

### Authoritative Documentation
- [FluentValidation Official Documentation](https://docs.fluentvalidation.net/)
- [Domain-Driven Design: Value Objects & Invariants](https://martinfowler.com/bliki/ValueObject.html)
- [CWE-1333: Inefficient Regular Expression Complexity (ReDoS)](https://cwe.mitre.org/data/definitions/1333.html)

---

# Self Assessment

1. Why should FluentValidation validators live in the Application layer rather than the Presentation/API layer?
2. What is the fundamental difference between an input validation error (422) and a domain invariant violation?
3. How can a poorly written Regular Expression in a validator cause a Denial of Service attack?
4. Why should you avoid executing asynchronous database queries inside FluentValidation rules?
5. How does the Result Pattern allow domain entities to reject invalid state without throwing CLR exceptions?
