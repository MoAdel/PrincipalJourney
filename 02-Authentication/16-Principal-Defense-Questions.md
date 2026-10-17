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

---

# Question 5: Monotonic Session Versioning vs Pure Stateless JWTs

### The Scenario:
A lead architect argues: *"Adding a `sessionVersion` check to our authentication pipeline ruins statelessness. If we have to verify a version on every request, we might as well go back to monolithic database sessions."*

### Principal Engineer Defense:
"Pure statelessness is a dangerous illusion when identity mutates. In the real world, employees are terminated, credentials leak, and roles are revoked. If your system cannot terminate active sessions on other devices immediately upon password reset, your zero-trust posture is broken.

**The Principal Solution**:
We do not fall back to monolithic relational database sessions. We implement **Multi-Tiered Session Versioning**:
1. The user record maintains an atomic integer `sessionVersion` that increments upon security events (password reset, role demotion, suspension).
2. The current version is cached in-process in an **L1 Memory Cache** with a 15-second sliding window (< 0.005ms latency, zero I/O).
3. The canonical version lives in an **L2 Redis Cache** ($O(1)$ < 0.3ms).
4. Mutations publish a pub/sub invalidation message that purges L1 caches across all API nodes immediately.

This gives us the best of both worlds: 99.9% of requests validate at purely in-memory speeds without touching the relational database, while achieving instant global revocation across all client devices."

---

# Question 6: Defeating the 30-Second TOTP Code Replay Window

### The Scenario:
During a security architecture review, a penetration tester notes: *"Your software authenticator TOTP engine uses a standard 30-second window with ±1 step tolerance. That means an intercepted 6-digit code can be replayed for up to 90 seconds. How do you prevent an attacker from replaying an intercepted TOTP code?"*

### Principal Engineer Defense:
"A naive TOTP implementation that only performs stateless mathematical verification (`VerifyCode(secret, code) == true`) is vulnerable to replay attacks throughout its entire validity window.

**The Principal Solution**:
We enforce **Atomic Step Invalidation**:
1. We store a `TotpLastStep: bigint?` column on the user entity representing the time-step counter $T = \lfloor (\text{UnixTime} - T_0) / 30 \rfloor$.
2. When a code is validated, the database update executes an atomic conditional mutation:
   ```sql
   UPDATE Users SET TotpLastStep = @CurrentStep
   WHERE Id = @UserId AND (TotpLastStep IS NULL OR TotpLastStep < @CurrentStep);
   ```
3. If the update affects zero rows, it proves that a token for this exact time-step (or a future step) has already been consumed. The request is rejected immediately as a replay attempt.
4. Furthermore, emergency recovery codes are stored as **one-way SHA-256 hashes at rest** and consumed atomically inside a database transaction, eliminating replay and database-leak risks."

---

# Question 7: Defending Dual-Rail Architecture & Real-Time WebSocket Security

### The Scenario:
A frontend tech lead asks: *"Why can't we just use Bearer tokens stored in localStorage for our React web app and pass `?access_token=...` in the query string for our SignalR WebSocket connections? It works and it's simple."*

### Principal Engineer Defense:
"Storing Bearer tokens in `localStorage` creates a catastrophic vulnerability: any XSS flaw in our codebase or in any of our hundreds of transitive npm dependencies grants malicious JavaScript unhindered access to exfiltrate raw user tokens.

**The Principal Solution**:
We enforce a **Dual-Rail Transport Security Boundary**:
1. **Rail A (First-Party Web)**: The web SPA connects through a Backend-for-Frontend (BFF) using encrypted, `HttpOnly`, `SameSite=Lax`, `Secure` session cookies. JavaScript cannot read these cookies, rendering token exfiltration via DOM XSS impossible.
2. **Rail B (Mobile & API)**: Native mobile apps, which run in isolated OS sandboxes without browser DOM XSS vectors, use Bearer JWTs with refresh token rotation stored in the iOS Keychain / Android Keystore.
3. **WebSocket Security**: Browsers cannot send custom `Authorization` headers during WebSocket handshakes. Rail A leverages the existing `HttpOnly` cookie automatically during the HTTP 101 upgrade handshake. For native clients that must pass query tokens, reverse proxies (Caddy / NGINX) are configured to strictly scrub and mask `access_token` query parameters from all server access logs to prevent credential leakage."


---

## 💰 The FinOps & Unit-Economics Defense Axis (02-Authentication)

### Question (The CFO / CTO Cost Challenge):
> *"This architecture is technically textbook, but we are killing it because the enterprise managed tier / over-provisioned footprint costs $15,000/month. Defend the 80%-good alternative at 20% of the cost, and state the exact quantitative threshold where upgrading becomes justified."*

**Principal Defense**:
1. **Unit-Economics First**: At early-to-mid scale (`< 1,500 RPS`), paying `$15,000/month` for dedicated multi-cluster licensing or 10x idle headroom violates unit economics (`Cost per 1M requests`).
2. **The 80%-Good Architecture at 20% Cost (`~$2,200/month`)**:
   - Replace network-chatty sidecars/clusters with in-process L1/L2 caching (`HybridCache`), bounded `System.Threading.Channels`, and modular monolith / shared-cluster partitioning with strict tenant/bulkhead quotas.
   - Apply tail-based sampling (`100%` errors, `1%` happy path) and topology-aware AZ routing to eliminate cross-AZ egress waste.
3. **Quantitative Upgrade Trigger (Invalidation Criteria)**:
   - We revisit and fund the `$15,000/month` tier only when sustained $p95$ load exceeds `8,000 RPS` for 14 consecutive days OR when contractual SLA downtime penalties exceed `$250,000/year`.

