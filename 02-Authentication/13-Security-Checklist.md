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
- [ ] **Monotonic Session Versioning**: `sessionVersion` claim validated on every request against L1 memory cache and L2 Redis store.
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

---

# 7. Multi-Factor Authentication & TOTP (RFC 6238)

- [ ] **Atomic Replay Prevention**: Verification enforces atomic SQL condition `totpLastStep < currentStep` to defeat code replay within the 30s window.
- [ ] **Two-Phase Ephemeral Challenge**: Password verification issues a 5-minute ephemeral `MfaChallenge` token; no full session is issued until 2FA completes.
- [ ] **Recovery Codes Hashed at Rest**: Backup codes stored exclusively as SHA-256 hashes in SQL and consumed atomically inside a transaction.
- [ ] **Risk-Based Enforcement**: Mandatory MFA enforced for all administrative and financial roles.

---

# 8. Dual-Rail & Real-Time Connection Security

- [ ] **BFF Cookie Isolation**: Web clients authenticate via `HttpOnly`, `SameSite=Lax/Strict`, and `Secure` cookies (immune to XSS token theft).
- [ ] **Proxy Log Scrubbing**: Reverse proxies (Caddy, NGINX, Envoy) configured to redact `access_token` query parameters in WebSocket upgrade logs.
- [ ] **Real-Time Tenant Boundaries**: SignalR / WebSocket connections isolated into `tenant:{tenantId}:user:{userId}` groups.
- [ ] **Forced Real-Time Eviction**: `RealtimeSessionManager` invokes `Clients.User(id).Abort()` upon session version increment or user suspension.

---

# 9. Direct Credential Defense & Delegation Governance

- [ ] **Argon2id / Bcrypt Hashing**: Passwords hashed using memory-hard KDFs (Argon2id with 64MB RAM or Bcrypt with cost >= 10).
- [ ] **Constant-Time Execution**: All hash and token comparisons use `CryptographicOperations.FixedTimeEquals`.
- [ ] **Anti-User-Enumeration**: Password reset endpoints return identical generic responses (`GENERIC_OK`) in constant time, executing dummy hashes on negative lookups.
- [ ] **View-Only Permissions Matrix**: Permissions matrix is code-defined and audit-only (`/dashboard/access`); mutable runtime permission checkboxes are strictly forbidden.
- [ ] **Delegation Safeguards**: Branch administrators blocked from granting admin privileges; self-demotion blocked; deletion of last tenant owner impossible.
