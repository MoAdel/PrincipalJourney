# 16 - Principal Security Architectural Defense Questions

> "A Senior Engineer knows how to configure security.
>
> A Principal Engineer can defend why this security architecture was chosen among competing alternatives under threat modeling and compliance constraints."

---

# Question 1: Asymmetric (RS256) vs Symmetric (HS256) Signing in Microservices

### The Scenario:
A backend engineer proposes: *"Using HMAC-SHA256 (HS256) is twice as fast and simpler than RSA. We should just share a 256-bit secret key across our 20 microservices."*

### Principal Engineer Defense:
"Symmetric signing (HS256) requires every verifying microservice to hold the secret key used for signing. This introduces a **catastrophic blast radius**:
- If an attacker compromises a single read-only reporting microservice, they obtain the symmetric secret and can forge administrative tokens for every other service in the company.
- Key rotation requires deploying configuration updates across all 20 repositories simultaneously.

**The Principal Solution**:
We enforce **Asymmetric RS256 / ES256 signing**:
- The private signing key is held strictly within the Identity Provider and protected by Azure Key Vault HSM.
- All microservices verify signatures using public keys retrieved from `/.well-known/jwks.json`.
- Compromise of a microservice exposes only public keys, resulting in zero token forgery capability."

---

# Question 2: Defeating Broken Object Level Authorization (BOLA)

### The Scenario:
How do you prove that an API endpoint `GET /api/v1/invoices/{id}` is immune to BOLA / IDOR attacks?

### Principal Engineer Defense:
"We implement a **three-layer defense against BOLA**:
1. **Tenant-Level Query Filtering**: EF Core Global Query Filters automatically append `WHERE TenantId = @currentTenant` to all SQL queries, ensuring cross-tenant records cannot be fetched even if an ID matches.
2. **Resource-Based Authorization Handlers**: After fetching the entity, we execute `IAuthorizationService.AuthorizeAsync(User, invoice, InvoiceOperations.Read)`. The handler explicitly verifies whether the user is the invoice owner or an assigned account manager within that tenant.
3. **Information Blinding**: If an unauthorized caller probes an invoice ID that belongs to another tenant or customer, the API returns `404 Not Found` rather than `403 Forbidden`, preventing resource enumeration."

---

# Question 3: Token Revocation vs Stateless Performance Trade-offs

### The Scenario:
How do you balance the performance benefits of stateless JWT access tokens with the security requirement of instant user session termination?

### Principal Engineer Defense:
"We employ a **Dual-Token Tiered Architecture**:
- **Access Tokens**: Short-lived (10 minutes) and verified statelessly in-memory using cached JWKS public keys (< 0.1ms latency, 0 database queries).
- **Refresh Tokens**: Long-lived, single-use, subject to rotation and stored in Redis/SQL with token family tracking.
- **Emergency Revocation**: When an account is compromised, an admin action writes a temporary `blacklist:user:{userId}` key to Redis with a TTL equal to the maximum access token lifetime (10 minutes).
- **Fast Revocation Check**: The authentication middleware performs an $O(1)$ in-memory Redis check on authenticated requests, giving us instant revocation while avoiding expensive relational database lookups."

---

# Question 4: Data Protection Key Ring in Multi-Cloud Environments

### The Scenario:
Why does ASP.NET Core require centralized key management for the Data Protection API, and what happens if keys are lost?

### Principal Engineer Defense:
"The Data Protection API is used for encrypting session cookies, anti-CSRF tokens, and temporary verification payloads.
- **Multi-Pod Scaling**: In a containerized environment (Kubernetes), each pod runs in an ephemeral container. If keys are stored locally, cookies encrypted by Pod A cannot be decrypted by Pod B, causing random session drops.
- **Centralized Persistence**: Keys must be centralized in durable storage (Azure Blob / S3 / Redis) with envelope encryption via Azure Key Vault / AWS KMS.
- **Key Loss Disaster**: If the Data Protection keys are permanently deleted or lost, all existing encrypted cookies, OAuth state tokens, and protected database fields become permanently unrecoverable."
