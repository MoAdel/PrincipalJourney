# 17 - Principal Security Technical Interview Scenarios

> "In a Staff/Principal interview, interviewers assess how you structure security boundaries, handle key rotation without downtime, and mitigate complex zero-trust threat models."

---

# Evaluation Rubric for Principal Security Candidates

| Assessment Area | Senior Candidate | Principal Security Candidate |
|---|---|---|
| **IAM Architecture** | "I use IdentityServer and configure JWT bearer tokens." | Analyzes OIDC discovery, PKCE attack mitigation, JWKS caching, token family replay tracking, and BFF gateway topologies. |
| **Authorization Depth** | Mentions `[Authorize(Roles = "Admin")]`. | Implements decoupled `IAuthorizationRequirement` policies, imperative resource-based handlers, and tenant isolation at the data access layer. |
| **Cryptographic Strategy** | Uses symmetric keys in configuration files. | Enforces asymmetric RS256/ES256, automated 90-day key rollover with grace periods, and HSM envelope encryption. |
| **Incident & Threat Modeling**| Focuses on patching bugs after security scans. | Performs STRIDE threat modeling, eliminates OWASP API Top 10 systematically, and designs automated defense-in-depth controls. |

---

# Scenario 1: Designing IAM for a Multi-Tenant B2B Healthcare Platform

### The Prompt:
*"Design the authentication and authorization architecture for a HIPAA-compliant healthcare platform accessed by 500 hospital networks, 50,000 doctors (using mobile and web apps), and automated medical device daemons. How do you design token governance, tenant isolation, and emergency session revocation?"*

### Expected Principal Response Structure:
1. **Client Authentication Topology**:
   - Web / Mobile: Authorization Code Flow with PKCE via OIDC redirect.
   - Medical Device Daemons: OAuth 2.0 Client Credentials Flow with mTLS (X.509 client certificates).
2. **Token Structure & Cryptography**:
   - Access tokens signed with asymmetric ES256 (ECDSA P-256) for compact payloads and fast verification.
   - Key Vault HSM holds private keys; public keys distributed via `/.well-known/jwks.json`.
   - Access token lifetime: 10 minutes.
3. **Tenant & Patient Data Isolation**:
   - Strict resource-based authorization handlers verifying doctor-patient consent records before querying Electronic Health Records (EHR).
   - Database queries enforced via EF Core global query filters matching hospital `TenantId`.
4. **Audit & Revocation**:
   - Single-use refresh token rotation with token family replay detection.
   - All authorization failures and access events logged as immutable audit events sent to an isolated SIEM (Azure Sentinel / Splunk).

---

# Scenario 2: Zero-Downtime Cryptographic Signing Key Rollover

### The Prompt:
*"Your security team mandates that your Identity Provider must rotate its RSA signing key every 60 days. How do you execute this rotation across 50 independent microservices without a single dropped request or service restart?"*

### Expected Principal Response:
1. **The 3-Phase Rollover Lifecycle**:
   - **Phase 1 (Publish New Key)**: IdP generates `Key_B` and publishes it alongside `Key_A` in `/.well-known/jwks.json`. IdP **continues signing tokens with `Key_A`**. All 50 microservices discover and cache `Key_B` in background without interruption.
   - **Phase 2 (Switch Active Signing Key)**: IdP begins signing newly issued tokens with `Key_B` (`kid: "2026-B"`). In-flight tokens signed with `Key_A` continue to be accepted by microservices because `Key_A` is still in the JWKS repository.
   - **Phase 3 (Deprecate Old Key)**: After the maximum token lifetime (e.g. 24 hours), `Key_A` is permanently removed from `jwks.json` and destroyed in Key Vault.
2. **Outcome**: Zero dropped requests, zero deployment coordination across microservices, 100% cryptographic continuity.
