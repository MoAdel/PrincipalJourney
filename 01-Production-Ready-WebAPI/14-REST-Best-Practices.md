# 14 - Enterprise REST API Best Practices

> "REST is not about mapping database tables to URLs.
>
> REST is an architectural style designed to decouple clients from servers, enable caching, enforce idempotency, and provide long-term contract stability."

---

# Why Should a Principal Engineer Care?

Most web APIs are "RPC over HTTP in disguise":

```
POST /api/orders/createOrder
POST /api/orders/updateOrderDetails
POST /api/orders/deleteOrderById?id=5
```

This anti-pattern abandons HTTP semantics, breaks intermediate reverse proxies and CDNs, ignores caching, and causes duplicate transaction bugs when networks fail.

As a Principal Engineer, you design APIs that:
- Honor **HTTP safety and idempotency** contracts.
- Prevent duplicate charges during network timeouts via **Idempotency Keys**.
- Scale query performance with **Keyset (Cursor) Pagination** instead of slow $O(n)$ offset scans.
- Prevent concurrent update overwrites using **ETags and Optimistic Concurrency (`If-Match`)**.
- Provide consistent, intuitive resource modeling for enterprise integrations.

---

# Production Story

Cyber Monday.

09:45 AM.

A customer clicks "Submit Order" for a $1,200 laptop.

The cellular network drops for 3 seconds. The mobile app receives a network timeout error.

The mobile app's automated retry policy re-issues the request:

```
POST /api/orders
```

The server receives both requests. Because `POST` is non-idempotent and the API did not implement idempotency keys:
- The backend created two distinct orders (`ORD-101` and `ORD-102`).
- The payment processor charged the customer's credit card twice ($2,400 total).
- The inventory system reserved double stock.

Over the next 6 hours, 3,400 customers experienced duplicate charges, costing Nova Commerce $48,000 in payment dispute fees and immense reputational damage.

The root cause? Treating HTTP `POST` as a naive remote procedure call without idempotency safeguards.

---

# The Principle: HTTP Semantics & Safety

A Principal Engineer designs endpoints around exact RFC specifications for HTTP methods:

```
┌─────────┬──────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Method  │ Safe?        │ Idempotent?  │ Expected Purpose                                       │
├─────────┼──────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ GET     │ YES (Read)   │ YES          │ Retrieve resource representation without side effects. │
│ HEAD    │ YES (Read)   │ YES          │ Same as GET but returns headers only (no body).        │
│ POST    │ NO (Mutate)  │ NO           │ Create subordinate resource or trigger an operation.   │
│ PUT     │ NO (Mutate)  │ YES          │ Replace entire resource or create at exact URI.        │
│ PATCH   │ NO (Mutate)  │ CONDITIONAL  │ Partial update to an existing resource.                │
│ DELETE  │ NO (Mutate)  │ YES          │ Remove resource (repeated deletes return 204 or 404).   │
└─────────┴──────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

### Safety:
A request is **Safe** if it does not alter server state. `GET /api/orders/123` must never mutate the database.

### Idempotency:
A request is **Idempotent** if making $N > 1$ identical requests has the **exact same side effect** on the server as making 1 request.

---

# Idempotency Architecture for Non-Idempotent Operations

How do you make `POST /api/orders` safe against client retries and network drops?

### The Idempotency Key Pattern:

```
Client                              API Gateway / Kestrel               Redis / Database
  │                                           │                                │
  │─── POST /orders (Idempotency-Key: K1) ───►│                                │
  │                                           │── Check Key Exists in Cache ──►│
  │                                           │◄── Not Found (Proceed) ────────│
  │                                           │                                │
  │                                           │── Acquire Distributed Lock ───►│
  │                                           │── Execute Order Creation ──────│
  │                                           │── Cache Result (201, Order) ──►│
  │◄── 201 Created (Order ORD-101) ───────────│                                │
  │                                           │                                │
  │ [Network Drop - Client Retries]           │                                │
  │─── POST /orders (Idempotency-Key: K1) ───►│                                │
  │                                           │── Check Key Exists in Cache ──►│
  │                                           │◄── Found Cached Result (201) ──│
  │◄── 201 Created (Order ORD-101 - Replayed)─│                                │
  │    (Zero duplicate processing!)           │                                │
```

### Key Implementation Guidelines:
1. Require the client to send a unique header: `Idempotency-Key: <UUID>`.
2. Use Redis or a database table to store the idempotency key with a TTL (e.g. 24 hours).
3. If the key is currently processing, return `409 Conflict` or wait on a distributed lock.
4. If the key has already completed, return the **exact cached response payload and headers** without re-executing business logic.

---

# Pagination at Scale: Offset vs Keyset (Cursor)

When querying collections (`GET /api/orders`):

### 1. Offset Pagination (Anti-Pattern at Scale)
```sql
SELECT * FROM Orders 
ORDER BY CreatedAt DESC 
OFFSET 50000 ROWS FETCH NEXT 20 ROWS ONLY;
```

**Why it fails in production:**
- **$O(n)$ Database Scan**: SQL Server must read and discard 50,000 index rows before returning the 20 requested rows.
- **Page Drift / Missing Items**: If a new order is inserted while the user flips from Page 1 to Page 2, items shift, causing duplicates or skipped rows.

### 2. Keyset / Cursor Pagination (Principal Standard)
```sql
SELECT TOP (20) * FROM Orders 
WHERE (CreatedAt < @LastSeenCreatedAt) OR (CreatedAt = @LastSeenCreatedAt AND Id < @LastSeenId)
ORDER BY CreatedAt DESC, Id DESC;
```

**Why it scales effortlessly:**
- **$O(1)$ Index Seek**: SQL Server seeks directly to the index position using a B-Tree seek.
- **Zero Page Drift**: Inserted items do not shift the cursor boundary.

```json
{
  "items": [ ... ],
  "pageSize": 20,
  "nextCursor": "MjAyNi0wOC0zMFQyMDoxNTowMFpfT1JELTk5Mg==",
  "hasNextPage": true
}
```

---

# Concurrency Control with ETags & `If-Match`

What happens when two administrators edit the same product price simultaneously?

```
User A reads Product (Price = $100)
User B reads Product (Price = $100)
User A updates Price to $120 (Saved!)
User B updates Price to $90  (OVERWRITES User A's change silently!)
```

This is the **Lost Update Problem**.

### The Solution: HTTP Optimistic Concurrency Control

```
1. Client fetches resource:
   GET /api/products/42
   ◄── 200 OK
   ETag: "v3-a8f9c1"

2. Client updates resource:
   PUT /api/products/42
   If-Match: "v3-a8f9c1"
   Body: { "price": 120 }

3. If another user updated the product in between (Version changed to "v4-e2b3"):
   ◄── 412 Precondition Failed
   (Client is informed that their copy is stale and must refresh before retrying)
```

In ASP.NET Core:
```csharp
[HttpPut("{id:guid}")]
public async Task<IActionResult> UpdateProduct(
    Guid id, 
    [FromBody] UpdateProductRequest request, 
    [FromHeader(Name = "If-Match")] string? ifMatch)
{
    var product = await _repository.GetByIdAsync(id);
    if (product == null) return NotFound();

    var currentETag = $"\"{product.RowVersion}\"";
    if (!string.IsNullOrEmpty(ifMatch) && ifMatch != currentETag)
    {
        return StatusCode(StatusCodes.Status412PreconditionFailed, 
            "Resource has been modified by another process. Please refresh.");
    }

    product.UpdatePrice(request.Price);
    await _repository.SaveChangesAsync();

    Response.Headers.ETag = $"\"{product.RowVersion}\"";
    return Ok(product);
}
```

---

# Common Mistakes

❌ **Using Verbs in URLs**
```
POST /api/getProductsById
POST /api/deleteOrder
```
✅ **Use Nouns for Resources and HTTP Verbs for Actions**
```
GET /api/products/{id}
DELETE /api/orders/{id}
```

❌ **Returning 200 OK for Resource Creation**
```csharp
[HttpPost]
public IActionResult Create() => Ok(new { id = 123 }); // Fails HTTP spec
```
✅ **Return 201 Created with Location Header**
```csharp
[HttpPost]
public IActionResult Create([FromBody] CreateOrderDto dto)
{
    var order = _service.Create(dto);
    return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
}
```

❌ **Returning 200 OK for Deleted Resources**
```csharp
[HttpDelete("{id}")]
public IActionResult Delete(Guid id) => NoContent(); // Returns 204 No Content
```

❌ **Unbounded Query Endpoints**
```csharp
[HttpGet]
public async Task<IActionResult> GetAll() => Ok(await _db.Orders.ToListAsync()); // OUT OF MEMORY
```
✅ **Always Enforce Hard Limits on Page Size (e.g. `Math.Min(pageSize, 100)`).**

---

# Architect's Decision

### Scenario
Nova Commerce provides a public merchant API for 5,000 external retail vendors to manage catalog items, inventory, and orders.

### Standards Adopted:
1. **Resource Modeling**: Plural lowercase nouns (`/api/v1/orders`, `/api/v1/catalog-items`).
2. **Mutations**: Financial and state-altering `POST` endpoints require an `Idempotency-Key` header stored in Redis with a 24-hour TTL.
3. **Pagination**: Default to Keyset Pagination for all high-volume tables (>100k rows).
4. **Concurrency**: All update operations (`PUT` / `PATCH`) enforce `If-Match` headers with entity `RowVersion` ETags to prevent lost updates.
5. **Errors**: Standardized RFC 7807 ProblemDetails across all responses.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Routes | "I made an endpoint that returns JSON." |
| **Senior** | REST Conventions | "I used GET, POST, PUT, DELETE with appropriate status codes." |
| **Principal** | Protocol & Distributed Resilience | "How does our API leverage HTTP caching, ensure idempotency across network retries, prevent database table scans via keyset pagination, and eliminate lost updates with optimistic concurrency?" |

---

# Learning Resources & References

### Authoritative Documentation
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines)
- [RFC 9110: HTTP Semantics (Replaces RFC 7231)](https://datatracker.ietf.org/doc/html/rfc9110)
- [IETF Draft: The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)

---

# Self Assessment

1. Explain the technical difference between a **Safe** HTTP method and an **Idempotent** HTTP method.
2. Why does offset pagination (`OFFSET / FETCH`) degrade exponentially on tables with millions of rows?
3. How does the `Idempotency-Key` header prevent double-charging in payment processing systems?
4. Walk through the step-by-step handshake of `ETag` and `If-Match` during an optimistic concurrency update.
5. What HTTP status code should be returned when: (a) a resource is created, (b) an asynchronous job is accepted for background processing, (c) a delete succeeds with no content?
