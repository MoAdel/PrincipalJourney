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
