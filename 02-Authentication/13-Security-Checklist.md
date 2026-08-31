# 13 - Principal Security & Threat-Model Release Checklist

> "A security gate is not a checklist of tools.
>
> It is an audit of cryptographic integrity, identity boundaries, and threat defenses."

---

# The Principal Security Release Gate

Before authorizing any API to handle production authentication or customer data:

---

# 1. OAuth 2.0 & OIDC Protocol Integrity

- [ ] **PKCE Mandated**: Authorization Code Flow with PKCE enforced on all public clients (SPA, Mobile).
- [ ] **No Legacy Flows**: Implicit Flow and ROPC disabled at the Identity Provider level.
- [ ] **Audience Isolation**: Resource server enforces strict `ValidAudience = "api://novacommerce"`; ID Tokens strictly rejected.
- [ ] **Issuer Verification**: `ValidIssuer` strictly enforced against trusted IdP domain with HTTPS.

---

# 2. Cryptographic Token Validation

- [ ] **Asymmetric Verification**: RS256 / ES256 used exclusively; HMAC symmetric secrets forbidden in microservices.
- [ ] **Algorithm Whitelisting**: `ValidAlgorithms = [SecurityAlgorithms.RsaSha256]` configured to prevent `"alg": "none"` and key confusion attacks.
- [ ] **Clock Skew Bounded**: `ClockSkew` clamped to a maximum of 60 seconds (never 5 minutes).
- [ ] **Zero Leaked Claims**: PII, passwords, and sensitive internal secrets excluded from JWT payload.

---

# 3. Authorization & Tenant Isolation

- [ ] **BOLA Eliminated**: Resource-based imperative authorization (`IAuthorizationService.AuthorizeAsync`) enforced on all entity queries and mutations.
- [ ] **Tenant Boundary**: EF Core global query filters enforce `TenantId` isolation across all database queries.
- [ ] **Decoupled Policies**: Zero hardcoded role strings in controllers; all endpoints use named policies.
- [ ] **Information Disclosure**: Cross-tenant unauthorized access attempts return `404 Not Found`.

---

# 4. Token Lifecycle & Revocation

- [ ] **Short Expiration**: Access Tokens expire in 10 to 15 minutes.
- [ ] **Single-Use Refresh Tokens**: Refresh token rotation enabled with Token Family replay detection.
- [ ] **Hashed Storage**: Refresh tokens stored as SHA-256 hashes in Redis / SQL (never plain text).
- [ ] **Emergency Lockout**: Redis revocation blacklist active and verified under load.

---

# 5. Data Protection Key Ring

- [ ] **Distributed Key Storage**: Keys persisted to Azure Blob Storage / Redis (never local container filesystem).
- [ ] **At-Rest Key Encryption**: Key ring encrypted at rest with Azure Key Vault RSA HSM key.
- [ ] **Fixed Application Name**: `SetApplicationName("NovaCommerce.Production")` explicitly configured.
- [ ] **Automated Rotation**: 90-day key lifetime configured.

---

# 6. Web & Network Security

- [ ] **Strict CORS Policy**: Whitelisted origin array from configuration; zero `AllowAnyOrigin()` in production.
- [ ] **Preflight Caching**: `SetPreflightMaxAge(TimeSpan.FromHours(24))` configured.
- [ ] **Rate Limiting**: Fixed/Sliding window rate limiters active on all authentication and public endpoints.
- [ ] **Mass Assignment Blocked**: All endpoints consume explicit, immutable request DTO records (zero entity binding).
- [ ] **Anti-SSRF**: Outbound webhooks validate and block private RFC 1918 and metadata IP addresses.
