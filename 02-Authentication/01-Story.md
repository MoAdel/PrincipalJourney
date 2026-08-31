# 01 - Production Security Incident Story: The Broken Token Breach

> "Authentication proves who you are.
>
> Authorization proves what you are allowed to do.
>
> Confusing the two is how multi-million dollar data breaches happen."

---

# The Incident

Tuesday.

03:14 AM.

Nova Commerce’s Security Operations Center (SOC) receives an automated alert from an anomaly detection service:

```
[CRITICAL ALERT]: User ID 4081 has downloaded 850,000 order records across 14,000 distinct tenant accounts in 12 minutes.
```

The user account belonged to an ordinary retail customer who had signed up 20 minutes prior.

The customer had not cracked any passwords, had not bypassed the firewall, and had not performed any SQL injection.

They simply opened their browser developer tools, inspected an API request, and realized something astonishing:

### The Vulnerability:
The endpoint was:
```http
GET /api/v1/orders/ORD-99824
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

When the client changed the URL to:
```http
GET /api/v1/orders/ORD-00001
GET /api/v1/orders/ORD-00002
GET /api/v1/orders/ORD-00003
```

The server responded with `200 OK` and the complete order details—including customer full names, home addresses, phone numbers, and purchased items—for every order in the company's history.

---

# Why Did This Happen?

Let's inspect the controller code written by a developer:

```csharp
[Authorize]
[HttpGet("{orderId}")]
public async Task<IActionResult> GetOrder(string orderId)
{
    // The [Authorize] attribute only verified that the token was signed.
    // It NEVER verified if the authenticated user OWNS this order!
    var order = await _orderRepository.GetByIdAsync(orderId);
    if (order == null) return NotFound();

    return Ok(order);
}
```

### The Flaws:
1. **Broken Object-Level Authorization (BOLA / IDOR)**: The API verified *authentication* (`[Authorize]`), but performed zero *resource-based authorization*. Any valid user could view every other user's data.
2. **Symmetric Secret Sharing**: The JWT was signed with a shared symmetric secret (`HMAC-SHA256`) stored in clear text across 15 microservices. If any single service was compromised, an attacker could forge administrative tokens for the entire ecosystem.
3. **Missing Token Revocation**: When the security team disabled the compromised user account in the database, the attacker continued querying the API for another 48 hours because the JWT access token was stateless and had no revocation verification.

---

# The Principal Engineer's Mandate

The executive leadership assembled an emergency meeting.

The CTO turned to you:

> "We cannot afford a security architecture built on patchwork attributes and developer memory. We need a zero-trust, cryptographic, policy-enforced security foundation that guarantees this never happens again."

Your task in Sprint 02 is to build that security foundation.
