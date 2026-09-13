# 03 - Enterprise Security Requirements: Nova Commerce

> "Security requirements that are vague are security vulnerabilities waiting to be exploited."

---

# Functional & Non-Functional Security Requirements

As the Principal Security Architect, you must translate organizational compliance (GDPR, SOC 2, PCI-DSS) into non-negotiable architectural requirements.

---

# 1. Identity & Protocol Requirements (SEC-REQ-01)

1. **User Authentication (OIDC)**: All first-party web and mobile users must authenticate via OpenID Connect using **Authorization Code Flow with PKCE (Proof Key for Code Exchange)**. The Implicit Flow and Resource Owner Password Credentials (ROPC) flows are **strictly forbidden**.
2. **Service-to-Service Authentication (OAuth 2.0)**: Machine-to-machine background services must authenticate using the **Client Credentials Flow** with mTLS or private key JWT assertions.
3. **Third-Party Integrations**: External developers accessing partner APIs must be restricted via OAuth 2.0 **granular scopes** (e.g. `orders.read`, `inventory.write`).

---

# 2. Cryptographic Token Verification (SEC-REQ-02)

1. **Asymmetric Signing**: All Access Tokens must be signed with **RS256** (RSA 2048-bit) or **ES256** (ECDSA P-256).
2. **Dynamic Key Discovery**: Web API services must dynamically discover and cache public keys via the Identity Provider's **JSON Web Key Set (`/.well-known/jwks.json`)**.
3. **Zero-Downtime Key Rollover**: Key rotation must occur without downtime using distinct `kid` (Key ID) matching and a 24-hour overlap grace period.
4. **Strict Token Validation**: Every request must validate:
   - Signature integrity against active JWKS.
   - `iss` (Issuer) matches the trusted authority.
   - `aud` (Audience) matches the specific resource server identifier.
   - `nbf` (Not Before) and `exp` (Expiration) with a maximum 1-minute clock skew.

---

# 3. Authorization & Tenant Isolation (SEC-REQ-03)

1. **Defense Against BOLA (Broken Object Level Authorization)**: No API endpoint may return a resource based solely on an entity ID from the URL without verifying that the authenticated caller has explicit ownership or tenancy rights.
2. **Policy-Based Architecture**: Authorization logic must be encapsulated in reusable, unit-testable `IAuthorizationRequirement` classes rather than ad-hoc controller conditionals.
3. **Multi-Tenancy Isolation**: Every request must establish an ambient `TenantContext`. Cross-tenant data access attempts must be rejected with `403 Forbidden` and logged as security events.

---

# 4. Token Lifetime & Revocation (SEC-REQ-04)

1. **Short-Lived Access Tokens**: Access Tokens must have a maximum lifetime of **10 to 15 minutes**.
2. **Refresh Token Rotation**: Refresh Tokens must be single-use. When a refresh token is used, the server issues a new token pair and invalidates the old refresh token.
3. **Replay Attack Detection**: If a previously used refresh token is presented again (indicating token theft), the server must immediately revoke the entire token family and force re-authentication.
4. **Emergency Revocation List**: The system must support immediate user/tenant revocation via a high-performance in-memory / Redis revocation blacklist.

---

# 5. Data Protection & Key Management (SEC-REQ-05)

1. **Data Protection Key Ring**: Cryptographic keys used for cookies, antiforgery tokens, and sensitive data encryption must be stored in a centralized, shared storage repository (Azure Blob Storage / Redis) and encrypted at rest with **Azure Key Vault HSM keys**.
2. **Automated Key Rotation**: Key rings must generate new keys every 90 days while maintaining decryption capability for legacy keys.

---

# 6. CORS & Web Security Boundaries (SEC-REQ-06)

1. **Zero Wildcards in Production**: `AllowAnyOrigin()` and `AllowAnyHeader()` with credentials are strictly prohibited in production environments.
2. **Strict Origin Whitelisting**: CORS must be restricted to explicit, verified domain names.
3. **Preflight Optimization**: `OPTIONS` preflight responses must specify `Access-Control-Max-Age` to reduce browser overhead.

---

# 7. Monotonic Session Versioning & Global Revocation (SEC-REQ-07)

1. **Monotonic Version Counter**: Every user account must possess a canonical `SessionVersion` integer tracked in the primary database and embedded into issued JWT claims.
2. **Instant Multi-Device Termination**: The `SessionVersion` must be atomically incremented upon password changes, resets, role demotions, account suspension, and MFA deactivation. Any token carrying an older version must be rejected immediately across all API nodes (< 1s global propagation).
3. **Multi-Tiered Cache Invalidation**: The authentication middleware must evaluate `sessionVersion` against an in-process L1 cache (15s sliding TTL) backed by a distributed Redis L2 cache, eliminating SQL query bottlenecks during peak load.

---

# 8. Dual-Rail Transport Security & Real-Time Eviction (SEC-REQ-08)

1. **Dual-Rail Client Boundary**: First-party web applications must use encrypted, `HttpOnly`, `SameSite=Lax`, and `Secure` session cookies (Rail A / BFF), completely eliminating token exposure to JavaScript DOM XSS. Native mobile apps and machine-to-machine integrations must use Bearer JWTs with refresh token rotation (Rail B).
2. **Real-Time Handshake Security**: WebSocket and SignalR connections must authenticate via session cookies or short-lived negotiation tickets. Passing raw, long-lived JWTs in URLs is strictly prohibited unless reverse proxy access logs actively redact the `access_token` query parameter.
3. **Real-Time Tenant Room Isolation & Forced Eviction**: Real-time clients must be strictly bound to private tenant and user groups (`tenant:{tenantId}:user:{userId}`). Upon session invalidation or user lockout, the real-time hub must forcibly terminate running socket connections (`Clients.User(id).Abort()`).

---

# 9. Multi-Factor Authentication & Replay Prevention (SEC-REQ-09)

1. **RFC 6238 / RFC 4226 Compliance**: TOTP authentication must implement standard 30-second time-step windows, 6-digit codes, and 4-bit dynamic truncation without third-party opaque black-boxes.
2. **Atomic Replay Prevention**: The verification engine must enforce an atomic SQL step check (`UPDATE Users SET TotpLastStep = @step WHERE Id = @id AND (TotpLastStep IS NULL OR TotpLastStep < @step)`), guaranteeing that a 6-digit code can never be replayed within the remaining validity window.
3. **Ephemeral Challenge Tokens**: Password verification must not issue full application sessions for MFA-enabled accounts; it must issue a short-lived (5-minute) challenge token requiring TOTP verification to unlock access.
4. **Hashed Recovery Codes**: Emergency backup recovery codes (`XXXXX-XXXXX`) must be stored strictly as **SHA-256 hashes at rest** and consumed atomically for single-use emergency recovery.
5. **Risk-Based Policy**: MFA must be mandatory for all administrative and financial roles, while operational field staff follow balanced risk-adjusted policies.

---

# 10. Direct Credential Defense & Delegation Boundaries (SEC-REQ-10)

1. **Modern Password Hashing**: Passwords must be hashed using **Argon2id** (64MB memory, 3 passes, 4 threads) or **Bcrypt** (cost factor >= 10). General-purpose algorithms (SHA-256, MD5) are unconditionally forbidden.
2. **Anti-User-Enumeration**: Authentication and password reset endpoints must return identical generic responses (`GENERIC_OK`) in constant time, executing dummy cryptographic work on negative lookups to eliminate timing side-channels.
3. **Constant-Time Evaluation**: All comparisons of tokens, signatures, and hashes must use `CryptographicOperations.FixedTimeEquals` to defeat byte-by-byte timing attacks.
4. **One-Way Token Hashing at Rest**: Refresh tokens, password reset tokens, and recovery codes must be stored in the database exclusively as **SHA-256 hashes**.
5. **Delegation Invariants**: Branch administrators cannot assign administrative roles; administrators cannot demote or escalate their own accounts; and the system must guarantee the immutable existence of at least one active tenant owner.
