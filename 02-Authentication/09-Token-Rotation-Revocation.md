# 09 - Refresh Token Rotation, Revocation & Distributed Blacklists

> "Stateless JWT access tokens provide high performance.
>
> Refresh tokens with rotation and revocation provide control and security."

---

# Why Should a Principal Engineer Care?

Because Access Tokens are stateless, **once a JWT is issued, it cannot be modified or canceled until it naturally expires**.

If an attacker intercepts an Access Token with a 24-hour expiration:
- The attacker maintains full access for 24 hours even if the user changes their password, is terminated from the company, or has their account locked.

To solve this, a Principal Engineer designs a **Dual-Token Architecture**:
1. **Access Tokens**: Ultra short-lived (10 to 15 minutes), purely stateless.
2. **Refresh Tokens**: Long-lived (7 to 30 days), stateful, single-use, subject to automated rotation and instant distributed revocation.

---

# The Refresh Token Rotation Lifecycle (RFC 6749 / OAuth 2.0 BCP)

```
Client App                                Auth Server / Token Service                     Database / Redis
    │                                                  │                                         │
    │ 1. User Authenticates (Login)                    │                                         │
    │─────────────────────────────────────────────────►│                                         │
    │                                                  │── Generate Token Pair:                  │
    │                                                  │   • AccessToken_1 (exp: 10 mins)        │
    │                                                  │   • RefreshToken_A (Family: F1, exp: 7d)│
    │                                                  │── Store (Token_A, User_105, F1, Active)►│
    │ 2. Return (AccessToken_1, RefreshToken_A)        │                                         │
    │◄─────────────────────────────────────────────────│                                         │
    │                                                  │                                         │
    │ [ 10 Minutes Elapse - AccessToken_1 Expires ]    │                                         │
    │                                                  │                                         │
    │ 3. POST /connect/token                           │                                         │
    │    (grant_type=refresh_token, RefreshToken_A)    │                                         │
    │─────────────────────────────────────────────────►│                                         │
    │                                                  │── Check Token_A is Active ─────────────►│
    │                                                  │── Invalidate Token_A (Mark Used) ──────►│
    │                                                  │── Issue Token_B (Family: F1) ──────────►│
    │ 4. Return (AccessToken_2, RefreshToken_B)        │                                         │
    │◄─────────────────────────────────────────────────│                                         │
```

---

# Detecting Token Theft: The Token Family Replay Defense

What happens if an attacker steals `RefreshToken_A` before the legitimate client uses it?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Attacker presents RefreshToken_A ──► Server issues (Access_2, Refresh_B).│
│ 2. Later, Legitimate User presents RefreshToken_A (already marked USED!).   │
│                                                                             │
│ [ CRITICAL SECURITY ALERT: REPLAY ATTACK DETECTED! ]                        │
│                                                                             │
│ 3. The Server detects that RefreshToken_A was used TWICE.                   │
│ 4. Immediate Automated Response:                                            │
│    • Invalidate the ENTIRE Token Family (F1).                               │
│    • Revoke RefreshToken_B held by the attacker immediately.                │
│    • Force both sessions to terminate and demand re-authentication!         │
└─────────────────────────────────────────────────────────────────────────────┘
```

This **Token Family Replay Defense** (mandated by OAuth 2.0 BCP) bounds the blast radius of stolen refresh tokens to a single cycle.

---

# Distributed Emergency Revocation via Redis Blacklist

What if an administrator locks a compromised user account immediately? How do we invalidate their current 10-minute access token across 50 running API nodes without polling the SQL database on every request?

### The Architecture: High-Performance In-Memory Revocation Filter

```csharp
public sealed class TokenRevocationMiddleware(
    RequestDelegate next,
    IConnectionMultiplexer redis,
    ILogger<TokenRevocationMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            var userId = user.FindFirst("sub")?.Value;
            var tokenJti = user.FindFirst("jti")?.Value; // Unique JWT Token ID

            var db = redis.GetDatabase();

            // Check if User or specific Token JTI is blacklisted (Redis O(1) in-memory check < 0.2ms)
            if (!string.IsNullOrEmpty(userId) && await db.KeyExistsAsync($"blacklist:user:{userId}"))
            {
                logger.LogWarning("Blocked revoked user {UserId}", userId);
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }
        }

        await next(context);
    }
}
```

---

# Common Mistakes

❌ **Reusing the Same Refresh Token for Months**
```csharp
// If a static refresh token leaks, the attacker has permanent access until manual database deletion.
```
✅ **Enforce Single-Use Refresh Token Rotation.**

❌ **Storing Refresh Tokens in Plain Text in the Database**
```sql
-- DANGEROUS: A SQL injection or database dump exposes all active refresh tokens!
```
✅ **Store only the SHA-256 cryptographic hash of the refresh token in the database (`RefreshTokenHash = SHA256(rawToken)`).**

❌ **Long Access Token Lifetimes (> 1 Hour)**
```
// Defeats the purpose of short-lived credentials and makes revocation ineffective.
```
✅ **Set Access Token lifetime to 10–15 minutes.**

---

# Architect's Decision

### Scenario
Nova Commerce requires secure mobile session persistence for 10 million users with instant account lockout capabilities.

### Decision:
1. **Access Tokens**: RS256 JWTs with 10-minute expiration.
2. **Refresh Tokens**: 256-bit cryptographically secure random strings, stored as SHA-256 hashes in Redis/SQL with 14-day sliding expiration.
3. **Rotation**: Single-use rotation on every refresh request with Token Family replay detection.
4. **Emergency Lockout**: Admin locks emit a Redis blacklist key (`blacklist:user:{id}`, TTL: 15 mins), immediately rejecting all access tokens.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Persistence | "I saved the refresh token in SQL Server." |
| **Senior** | Rotation | "I generate a new refresh token on every `/refresh` call." |
| **Principal** | Threat Modeling & Blast Radius | "How does our token family replay detection prevent credential cloning? What is our Redis revocation latency? How are refresh tokens hashed at rest?" |

---

# Learning Resources & References

### Authoritative Documentation
- [OAuth 2.0 Threat Model and Security Considerations (RFC 6819)](https://datatracker.ietf.org/doc/html/rfc6819)
- [OAuth 2.0 for Browser-Based Apps (BAP BCP)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
