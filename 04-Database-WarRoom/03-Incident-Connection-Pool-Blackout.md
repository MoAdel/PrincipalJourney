# Incident 03: The 800-Connection Starvation & Sockets Blackout

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Container Apps (32 Pods) talking to PostgreSQL / Azure SQL  
> **Business Impact**: Total application blackout; 504 Gateway Timeouts on all endpoints; connection pool exhausted within 15 seconds  
> **Competencies Mastered**: ADO.NET / Npgsql Connection Pooling, External HTTP Calls Inside DB Transactions, Sizing Formulas, Connection Leaks

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 10:15 AM, payment gateway latency increases from 120ms to 2,800ms due to upstream bank throttling.

Immediately, Nova Commerce's 32 application pods begin crashing with:

```text
[10:15:22] System.InvalidOperationException: Timeout expired. 
The timeout period elapsed prior to obtaining a connection from the pool. 
This may have occurred because all pooled connections were in use and max pool size was reached.
[10:15:35] Ingress Gateway: 504 Gateway Timeout on /api/v1/checkout.
[10:15:50] Kubernetes Metric: Kestrel active thread pool queue: 1,420 waiting requests.
```

The DevOps engineer inspects the database:
> *"The database CPU is only at 8%! Disk IOPS is at 5%! The database is practically idle, but the application says it can't connect. Why are all 800 connection slots full if the database isn't doing any work?!"*

---

## 🔍 2. Diagnostic Investigation

Inspect the checkout transaction implementation in `CheckoutService.cs`:

```csharp
public async Task<CheckoutResult> ProcessOrderAsync(CheckoutRequest request)
{
    // 1. Open Database Transaction
    await using var tx = await _dbContext.Database.BeginTransactionAsync();

    // 2. Insert Order
    var order = new Order { CustomerId = request.CustomerId, Total = request.Total };
    await _dbContext.Orders.AddAsync(order);
    await _dbContext.SaveChangesAsync();

    // 3. FATAL FLAW: Calling external 3rd-party Payment HTTP API INSIDE the open DB transaction!
    var paymentResponse = await _paymentHttpClient.PostAsJsonAsync("https://api.stripe.com/v1/charges", new 
    {
        amount = request.Total,
        customer = request.CustomerId
    });

    if (!paymentResponse.IsSuccessStatusCode)
    {
        await tx.RollbackAsync();
        return CheckoutResult.Failed;
    }

    order.PaymentReceipt = await paymentResponse.Content.ReadAsStringAsync();
    await _dbContext.SaveChangesAsync();

    // 4. Commit
    await tx.CommitAsync();
    return CheckoutResult.Success;
}
```

### The Root Cause:
1. When Stripe slowed down to 2.8 seconds, each checkout request **held an active database connection open and idle** for 2.8 seconds!
2. At 300 RPS, within 3 seconds, all **800 connection slots in the pool were consumed** by threads doing nothing except waiting for network HTTP responses from Stripe!
3. New requests could not obtain a connection, starving the entire application pool.

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### Sockets and Transactions are Physical Resources
* A database transaction binds a client socket to a dedicated server worker thread.
* While the client waits on an external HTTP call, the database server cannot reassign that connection to anyone else.
* Holding a transaction open also prevents database **version store cleanup** and retains row locks.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### The Refactored Solution:

```csharp
public async Task<CheckoutResult> ProcessOrderRefactoredAsync(CheckoutRequest request)
{
    // STEP 1: Execute all external network HTTP calls BEFORE opening the database transaction!
    var paymentReceipt = await _paymentService.ChargeCustomerAsync(request.CustomerId, request.Total);
    if (!paymentReceipt.IsSuccess)
    {
        return CheckoutResult.Failed("Payment declined");
    }

    // STEP 2: Database transaction opens ONLY for the pure data write (sub-5ms duration!)
    await using var tx = await _dbContext.Database.BeginTransactionAsync();

    var order = new Order 
    { 
        CustomerId = request.CustomerId, 
        Total = request.Total,
        PaymentReceipt = paymentReceipt.TransactionId,
        Status = OrderStatus.Paid 
    };

    await _dbContext.Orders.AddAsync(order);
    await _dbContext.SaveChangesAsync();

    await tx.CommitAsync(); // Transaction duration: 3.2 milliseconds!

    return CheckoutResult.Success;
}
```

### Connection Pool Configuration (`Program.cs`):
```csharp
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("Database"), npgsqlOptions =>
    {
        npgsqlOptions.CommandTimeout(5); // Strict 5s query timeout
    });
}, poolSize: 64); // Sized to match CPU core capacity
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (HTTP inside Transaction) | After (Out-of-Transaction Call) |
|---|---|---|
| **Database Connection Hold Time** | **2,850 ms** | **3.2 ms (890x faster)** |
| **Active Pooled Connections** | 800 (Saturated / Timeouts) | **18 active connections** |
| **504 Gateway Timeouts** | 34% error rate | **0% error rate** |
| **Throughput Capacity** | Collapsed at 300 RPS | **18,500 RPS without degradation** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Software Architect):
> *"If we charge the customer before inserting the order into the database, what happens if the database crashes right after the charge? The customer is billed, but the order is lost!"*

**The Principal Defense**:
> *"That is why distributed systems use **Idempotency Keys and the Outbox / Reconciliation Pattern**, not long-held database transactions. We generate a unique deterministic `Idempotency-Key` (e.g., `order_guid_42`) before calling Stripe. If the server crashes before persisting the order, the customer's retry sends the identical idempotency key; Stripe returns the existing charge without double-billing, and our system finishes creating the order. Holding database connections open waiting on external internet APIs creates an availability disaster for every other user on the platform."*

---

## 📜 6. The Executive Deliverable: ADR-003

```markdown
# ADR-003: Strict Prohibition of External I/O Inside Database Transactions

## Context
A SEV-1 outage occurred when external payment gateway latency held 800 database connections open and idle, starving the application pool.

## Decision
1. External network operations (HTTP, gRPC, Email, Message Queuing) are strictly forbidden within active database transactions.
2. Transactions must be scoped strictly around local database state changes, maintaining an execution window of <10ms.
3. Enforce distributed idempotency keys for payment gateway reconciliation.

## Consequences
- **Positive**: Connection hold times reduced from 2.8s to 3ms; eliminates connection pool starvation.
- **Negative**: Requires handling distributed crash reconciliation via idempotency.
```
