# Challenge 02 — Authentication, Authorization & API Security Architecture

> **Sprint 02**
>
> Estimated Duration: **7 Days**
>
> Estimated Effort: **22–28 Hours**
>
> Difficulty: ⭐⭐⭐⭐☆
>
> Target Level:
>
> Senior Software Engineer → Principal / Staff Security Architect

---

# Challenge Overview

Welcome to Sprint 02 of the Principal Engineer Academy.

Authentication and Security are the most unforgiving domains in software engineering.

In business logic, a bug might cause a calculation error.

In security architecture, a single subtle design flaw—such as an unvalidated JWT signature, an algorithmic downgrade vulnerability, a missing tenant check, or a leaked data protection key—can lead to total corporate compromise, multi-million dollar regulatory fines (GDPR, PCI-DSS, HIPAA), and destroyed customer trust.

Every security decision you make throughout this challenge must answer one question:

> **"If an attacker has full access to the network traffic and decompiles our client application, does our security boundary still hold?"**

If the answer relies on obscurity or client-side trust, the design is fundamentally broken.

---

# Business Context & Mission

You are the Principal Engineer leading the security architecture for **Nova Commerce**.

Nova Commerce is expanding its platform:
1. **Multi-Tenant B2B Enterprise Partners**: 450 corporate retail clients querying order APIs.
2. **First-Party Consumer Mobile & Web Apps**: 10 million active shoppers.
3. **Internal Microservices & Background Workers**: 25 backend services communicating across zero-trust networks.
4. **Third-Party Developer Ecosystem**: External app developers building plug-ins on top of Nova Commerce APIs.

### Your Mission:
Design and implement an end-to-end, zero-trust Identity and Access Management (IAM) architecture that:
- Implements RFC-compliant **OAuth 2.0 & OpenID Connect (OIDC)** flows.
- Validates JWTs cryptographically with zero-downtime JWKS key rotation.
- Enforces fine-grained **Policy-Based and Resource-Based Authorization** (preventing BOLA/IDOR).
- Implements secure **Refresh Token Rotation & Revocation Lists**.
- Protects cryptographic state with the **ASP.NET Core Data Protection API**.
- Hardens the API against the **OWASP API Security Top 10**.

---

# Learning Objectives

By the end of this sprint, you will master:

1. **Protocol Fundamentals**: OAuth 2.0 Authorization Code Flow with PKCE, Client Credentials Flow, OIDC ID Tokens vs Access Tokens.
2. **Cryptographic Mechanics**: Asymmetric signing (RS256/ES256), JWKS endpoint discovery (`.well-known/jwks.json`), `kid` key rotation, algorithmic downgrade attacks (`alg: none`).
3. **Authorization Engine**: ClaimsPrincipal construction, custom `IAuthorizationRequirement` & `AuthorizationHandler<T>`, Imperative Resource-Based Authorization.
4. **Token Lifecycle & Session Versioning**: Short-lived access tokens, Sliding refresh tokens, Monotonic `sessionVersion` instant multi-device invalidation, Redis-backed revocation blacklists.
5. **Key Management & Multi-Rail**: ASP.NET Core Data Protection Key Ring, Azure Key Vault envelope encryption, Dual-Rail Cookie BFF vs Bearer architecture, Real-time WebSocket/SignalR connection security.
6. **Multi-Factor Authentication & Credential Defense**: RFC 6238/4226 TOTP mathematical engine, atomic replay prevention (`totpLastStep`), emergency recovery codes, anti-user-enumeration constant-time defenses, and administrative delegation governance.
7. **Web Security**: Strict CORS policies, Preflight caching, Rate limiting, Defense against BOLA, Broken Authentication, and Mass Assignment.

---

# Structure of Sprint 02 Modules

```
02-Authentication/
├── 01-Story.md
├── 02-Learning-Objectives.md
├── 03-Security-Requirements.md
├── 04-Security-Architecture.md
├── 05-OAuth2-Architecture.md
├── 05A-Inside-OAuth2-OIDC-Internals.md
├── 06-JWT-Crypto-Internals.md
├── 06A-Inside-Jwt-Validation-Pipeline.md
├── 07-Claims-And-Policy-Authorization.md
├── 07A-Inside-Policy-Engine.md
├── 08-Resource-Based-Authorization.md
├── 09-Token-Rotation-Revocation.md
├── 09A-Inside-Session-Versioning-Hybrid.md
├── 10-Data-Protection-API.md
├── 10A-Inside-Data-Protection-KeyRing.md
├── 10B-Dual-Rail-And-Realtime-Security.md
├── 11-CORS-Security-Policy.md
├── 12-OWASP-API-Top10-Mitigation.md
├── 12A-Inside-MFA-TOTP-Engine.md
├── 12B-Credential-Defense-And-Delegation.md
├── 13-Security-Checklist.md
├── 14-Hands-On-Security-Labs.md
├── 15-Security-Incident.md
├── 16-Principal-Defense-Questions.md
├── 17-Interview-Scenarios.md
├── 18-Summary.md
└── 19-Resources.md
```
