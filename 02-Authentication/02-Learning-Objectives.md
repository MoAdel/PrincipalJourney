# 02 - Learning Objectives & Competency Matrix

> "Security is not a feature you add to software.
>
> Security is a set of cryptographic, architectural, and operational constraints that you enforce upon every boundary."

---

# Learning Goals

By completing this sprint, you will achieve the following competencies:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Sprint 02 Competency Levels                            │
├─────────────────┬───────────────────────────────────────────────────────────────┤
│ 1. Protocols    │ OAuth 2.0 (Auth Code + PKCE, Client Credentials), OIDC, Dual  │
│ 2. Cryptography │ RSA/ECDSA asymmetric signing, JWKS rotation, thumbprint cache │
│ 3. Engine       │ ClaimsPrincipal, custom Requirements, Resource Handlers (BOLA)│
│ 4. Lifecycle    │ Refresh Token Rotation, Monotonic sessionVersion, Redis Cache │
│ 5. Protection   │ ASP.NET Core Data Protection Key Ring, HSM / Azure Key Vault  │
│ 6. Real-Time    │ Dual-Rail Web/API, WebSocket Handshake auth, SignalR Ejection │
│ 7. MFA & TOTP   │ RFC 6238/4226 Engine, Atomic Replay Defense, Recovery Codes   │
│ 8. Defenses     │ OWASP Top 10, Anti-Enumeration, FixedTimeEquals, Delegation   │
└─────────────────┴───────────────────────────────────────────────────────────────┘
```

---

# Principal-Level Competency Rubric

| Domain | Senior Engineer Level | Principal Security Architect Level |
|---|---|---|
| **Authentication Protocols** | Uses `AddJwtBearer()` with hardcoded secret key in `appsettings.json`. | Configures OIDC metadata discovery (`.well-known/openid-configuration`), JWKS caching, and PKCE-mandated flows for public clients. |
| **Cryptography** | Assumes HS256 symmetric signing is adequate for all services. | Enforces asymmetric RS256/ES256 signing with automated key rotation (`kid`), key-rollover grace periods, and alg-downgrade defenses. |
| **Authorization** | Relies on simple `[Authorize(Roles = "Admin")]` string checks. | Implements decoupled, testable `IAuthorizationRequirement` handlers, resource-based imperative evaluation, and multi-tenant domain guards. |
| **Token Lifecycle & Revocation** | Issues 7-day stateless JWTs with no revocation mechanism. | Enforces 10-minute access tokens + sliding refresh tokens with family rotation, plus monotonic `sessionVersion` instant multi-device invalidation. |
| **Multi-Rail & Real-Time** | Stores JWTs in browser `localStorage` and appends tokens to WebSocket URLs without sanitization. | Implements Dual-Rail (HttpOnly Cookie BFF for web vs Bearer for mobile), short-lived tickets for WebSockets, and real-time room eviction. |
| **Multi-Factor Authentication** | Treats MFA as an external opaque black-box or relies on vulnerable SMS OTP. | Implements RFC 6238 TOTP engine, enforces atomic step replay prevention (`totpLastStep`), and hashes recovery codes with SHA-256 at rest. |
| **Credential Defense & Governance** | Uses standard `==` string checks and returns descriptive "Email not found" errors. | Enforces Argon2id/Bcrypt hashing, `CryptographicOperations.FixedTimeEquals` timing protection, constant-time anti-enumeration, and audit-only matrix governance. |
| **Secret Protection** | Stores encryption keys in local folders or connection strings. | Uses ASP.NET Core Data Protection API backed by Azure Blob Storage + Azure Key Vault envelope encryption with automatic 90-day key generation. |
| **API Threat Modeling** | Configures `app.UseCors(builder => builder.AllowAnyOrigin())`. | Enforces strict CORS origins, preflight caching, rate limiting, and automated prevention of Broken Object Level Authorization (BOLA). |
