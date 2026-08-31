# 04 - Zero-Trust API Security Architecture

> "Zero Trust is not a product you buy.
>
> Zero Trust is an architectural model: Never Trust, Always Verify."

---

# The Zero-Trust Security Blueprint

In a traditional perimeter security model, everything inside the corporate network is assumed to be safe.

In a **Zero-Trust Architecture**, every single request—whether originating from the public internet or an internal microservice—must be cryptographically authenticated, authorized, and audited.

```
                               Incoming Request
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   TLS 1.3 Termination     │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │ Strict CORS & Rate Limiter│
                        └─────────────┬─────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Authentication Middleware (JwtBearerHandler)                              │
│                                                                           │
│  • Signature Verification via JWKS Key Cache (RS256 / ES256)              │
│  • Validate Issuer ('iss') & Audience ('aud')                             │
│  • Check Lifetime ('exp', 'nbf') with 1m Clock Skew                       │
│  • Query Redis Revocation Blacklist for Revoked Tokens / Users            │
│  • Construct ClaimsPrincipal & SecurityContext                            │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Multi-Tenant Context Middleware                                           │
│                                                                           │
│  • Extract TenantId Claim ('tid')                                         │
│  • Validate Active Tenant Subscription Status                             │
│  • Establish Ambient Scoped TenantContext for Database Queries            │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Authorization Middleware (IAuthorizationService)                          │
│                                                                           │
│  • Execute IAuthorizationRequirement Policies                             │
│  • Resource-Based Imperative Ownership Evaluation (Anti-BOLA)             │
│  • Permission Matrix & Granular Scope Evaluation                          │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Application Execution & Data Layer                                        │
│                                                                           │
│  • Entity Framework Core Global Query Filters (Tenant Isolation)          │
│  • Audit Logging of All Security Events & Permission Changes              │
└───────────────────────────────────────────────────────────────────────────┘
```

---

# The Core Security Boundaries

A Principal Engineer partitions security into four distinct boundaries:

### 1. The Token Verification Boundary (Identity)
- The Web API does **not** manage passwords or authenticate user credentials directly.
- The Web API is a **Resource Server**. It delegates identity verification to a trusted **OpenID Connect Identity Provider (IdP)** (e.g. Microsoft Entra ID, Duende IdentityServer, Auth0, Keycloak).
- Verification is stateless and cryptographic via public keys fetched from `/.well-known/jwks.json`.

### 2. The Claims & Tenant Context Boundary (Context)
- Once the JWT is verified, claims (`sub`, `email`, `tid`, `roles`, `permissions`) are mapped into a `ClaimsPrincipal`.
- A custom middleware extracts tenancy identifiers and injects a scoped `ITenantContext`, ensuring EF Core automatically filters database queries by tenant ID.

### 3. The Policy & Resource Evaluation Boundary (Authorization)
- Declarative attributes (`[Authorize(Policy = "...")]`) enforce coarse-grained role and scope requirements at the endpoint boundary.
- Imperative handlers (`IAuthorizationService.AuthorizeAsync(User, resource, "CanEditOrder")`) enforce fine-grained object-level ownership checks before modifying state.

### 4. The Cryptographic Key Ring Boundary (Data Protection)
- Ephemeral tokens, session cookies, and encrypted payloads use the **ASP.NET Core Data Protection API**.
- Key rings are centralized in Azure Blob Storage / Redis and encrypted with an Azure Key Vault RSA master key, enabling seamless horizontal scale-out across container pods.
