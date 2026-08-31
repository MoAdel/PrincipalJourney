# 12 - OWASP API Security Top 10 Enterprise Defense

> "Security vulnerabilities do not appear at random.
>
> They follow predictable structural patterns that can be systematically eliminated through architectural controls."

---

# The OWASP API Security Top 10 (2023 Edition)

A Principal Engineer designs systematic architectural defenses against every single category of the OWASP API Security Top 10:

```
┌─────────┬───────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Rank    │ Vulnerability Name                        │ Principal Architectural Defense                        │
├─────────┼───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ API1    │ Broken Object Level Authorization (BOLA)  │ Resource-Based Authorization (IAuthorizationService)   │
│ API2    │ Broken Authentication                     │ Short-lived JWTs, PKCE, Refresh Token Rotation, Redis  │
│ API3    │ Broken Object Property Level Auth (BOPLA) │ Explicit DTOs (Zero Over-Posting / Mass Assignment)    │
│ API4    │ Unrestricted Resource Consumption         │ Rate Limiting, Keyset Pagination, ReDoS Timeouts       │
│ API5    │ Broken Function Level Authorization (BFLA)│ Declarative Policies, Strict HTTP Method Mapping       │
│ API6    │ Unrestricted Access to Sensitive Business │ Distributed Lock Idempotency, Behavioral Anomaly Alerts│
│ API7    │ Server-Side Request Forgery (SSRF)        │ Strict Outbound URL Whitelisting, Private Network IP   │
│ API8    │ Security Misconfiguration                 │ Strict CORS, No Stack Trace Leaks, HTTPS Redirection   │
│ API9    │ Improper Inventory Management             │ URL Versioning (/api/v1/), RFC 8594 Sunset Headers     │
│ API10   │ Unsafe Consumption of APIs                │ Typed HttpClients, Polly Circuit Breaker, Sanitization │
└─────────┴───────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

# Detailed Defense Strategies

### 1. API3: Broken Object Property Level Authorization (Mass Assignment / Over-Posting)
- **The Vulnerability**: An attacker sends `{ "name": "Shoe", "price": 10, "isAdmin": true, "role": "SuperAdmin" }`. A naive controller binds JSON directly to the database `User` entity, making the attacker an admin.
- **Principal Defense**: **Never bind HTTP requests directly to database domain entities**. Always use dedicated, immutable request records:
  ```csharp
  // Immutable, tightly scoped DTO:
  public sealed record UpdateUserDto(string DisplayName, string PhoneNumber);
  ```

---

### 2. API4: Unrestricted Resource Consumption (DoS / Rate Limiting)
- **The Vulnerability**: Attackers send 50,000 requests/minute or query `pageSize=1000000`, exhausting database CPU and memory.
- **Principal Defense**: Enforce ASP.NET Core Rate Limiting and strict pagination clamps:
  ```csharp
  builder.Services.AddRateLimiter(options =>
  {
      options.AddFixedWindowLimiter("PublicApiLimiter", opt =>
      {
          opt.PermitLimit = 100;
          opt.Window = TimeSpan.FromMinutes(1);
          opt.QueueLimit = 0;
      });
  });
  ```

---

### 3. API7: Server-Side Request Forgery (SSRF)
- **The Vulnerability**: An endpoint accepts a webhook URL (`POST /api/v1/webhooks { "url": "http://169.254.169.254/metadata" }`) and queries the cloud metadata service to steal IAM credentials.
- **Principal Defense**: Validate and resolve outbound hostnames; block private RFC 1918 IP addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and cloud metadata endpoints (`169.254.169.254`).

---

# Self Assessment

1. Explain the difference between BOLA (API1) and BFLA (API5).
2. How does using explicit Request DTOs prevent Mass Assignment / Broken Object Property Level Authorization (API3)?
3. Why is an SSRF (Server-Side Request Forgery) attack against a cloud metadata service so devastating?
4. How do rate limiting and Keyset pagination mitigate Unrestricted Resource Consumption (API4)?
