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
│ 1. Protocols    │ OAuth 2.0 (Auth Code + PKCE, Client Credentials), OIDC, SAML2 │
│ 2. Cryptography │ RSA/ECDSA asymmetric signing, JWKS rotation, thumbprint cache │
│ 3. Engine       │ ClaimsPrincipal, custom Requirements, Resource Handlers       │
│ 4. Lifecycle    │ Refresh Token Rotation, Cryptographic Binding, Revocation     │
│ 5. Protection   │ ASP.NET Core Data Protection Key Ring, HSM / Azure Key Vault  │
│ 6. Defenses     │ OWASP API Security Top 10, BOLA, Mass Assignment, CORS        │
└─────────────────┴───────────────────────────────────────────────────────────────┘
```

---

# Principal-Level Competency Rubric

| Domain | Senior Engineer Level | Principal Security Architect Level |
|---|---|---|
| **Authentication Protocols** | Uses `AddJwtBearer()` with hardcoded secret key in `appsettings.json`. | Configures OIDC metadata discovery (`.well-known/openid-configuration`), JWKS caching, and PKCE-mandated flows for public clients. |
| **Cryptography** | Assumes HS256 symmetric signing is adequate for all services. | Enforces asymmetric RS256/ES256 signing with automated key rotation (`kid`), key-rollover grace periods, and alg-downgrade defenses. |
| **Authorization** | Relies on simple `[Authorize(Roles = "Admin")]` string checks. | Implements decoupled, testable `IAuthorizationRequirement` handlers, resource-based imperative evaluation, and multi-tenant domain guards. |
| **Token Lifecycle** | Issues 7-day stateless JWTs with no revocation mechanism. | Issues 10-minute short-lived access tokens + sliding refresh tokens with rotation detection, family tracking, and Redis revocation lists. |
| **Secret Protection** | Stores encryption keys in local folders or connection strings. | Uses ASP.NET Core Data Protection API backed by Azure Blob Storage + Azure Key Vault envelope encryption with automatic 90-day key generation. |
| **API Threat Modeling** | Configures `app.UseCors(builder => builder.AllowAnyOrigin())`. | Enforces strict CORS origins, preflight caching, rate limiting, and automated prevention of Broken Object Level Authorization (BOLA). |
