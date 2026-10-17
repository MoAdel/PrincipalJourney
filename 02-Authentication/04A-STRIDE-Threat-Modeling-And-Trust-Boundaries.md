# 04A — Inside STRIDE Threat Modeling & Cryptographic Trust Boundaries

> "Security checklists catch yesterday's vulnerabilities. Threat modeling at the trust-boundary level catches architectural flaws before a single line of code is written."

---

## 1. Decomposing System Trust Boundaries (DFD)

A **Trust Boundary** is any locus where execution context, principal identity, or network privilege level changes. Every data flow crossing a trust boundary must undergo explicit authentication, schema validation, rate limiting, and audit logging.

```text
 [Untrusted Public Internet]
             │
 ═══════[Trust Boundary 1: Edge TLS / WAF / Rate Limiter]═══════
             ▼
    [API Gateway / YARP]
             │ (mTLS + RFC 8693 Scoped JWT + W3C TraceContext)
 ═══════[Trust Boundary 2: Service Mesh / Pod Identity]═════════
             ▼
    [Order Microservice]
             │ (Managed Identity Token + Row-Level Security TenantId)
 ═══════[Trust Boundary 3: Data Plane Persistence]══════════════
             ▼
    [Primary SQL / Redis]
```

---

## 2. Complete STRIDE Mitigation & Validation Matrix

| Threat Category | Security Property Violated | Concrete Enterprise Attack Vector | Architectural Mitigation | Validation & Rollback Procedure |
|---|---|---|---|---|
| **S — Spoofing** | Authentication | Attacker forges JWT using `alg: HS256` signed with the server's public RSA key (Key Confusion Attack). | Pin explicit `ValidAlgorithms = [SecurityAlgorithms.RsaSha256]` in `TokenValidationParameters`; enforce mTLS internally. | Automated security test sends `alg: none` and `HS256`-forged tokens; fail CI if status != `401`. |
| **T — Tampering** | Integrity | Client modifies `MerchantId` or `Price` in JSON payload or tampers with pagination cursor. | Never bind pricing/ownership from DTOs; sign stateless cursors with HMAC-SHA256 (`IDataProtector`). | Fuzz API endpoints with mutated HMAC signatures in staging; verify `400/403` rejection. |
| **R — Repudiation** | Non-Repudiation | Compromised admin deletes financial ledger records and claims they never logged in. | Append-only immutable audit log (SQL Ledger / WORM Blob Storage) recording `sub`, `jti`, `ip`, and cryptographic hash chain. | Verify hash-chain integrity nightly via `sys.database_ledger_digest_locations`. |
| **I — Information Disclosure** | Confidentiality | Stack trace in HTTP 500 leaks connection string, or timing side-channel reveals valid usernames. | Enforce RFC 9457 `ProblemDetails` scrubbing internal exceptions; use `CryptographicOperations.FixedTimeEquals`. | Run OWASP ZAP scan in CI; assert zero stack traces or server version headers (`Server: Kestrel` stripped). |
| **D — Denial of Service** | Availability | Unbounded GraphQL/JSON nesting depth or `Regex` catastrophic backtracking freezes CPU cores. | Set `MaxDepth = 32` on `JsonSerializerOptions`; enforce `RegexOptions.NonBacktracking` + timeout (`100ms`). | k6 payload-bomb test sends 10MB deeply nested JSON; verify `413/400` in `< 2ms` with zero GC spike. |
| **E — Elevation of Privilege** | Authorization | User A changes URL `/api/orders/1042` to `/api/orders/1043` (BOLA / IDOR) or injects `"role": "Admin"` via mass assignment. | Enforce `IAuthorizationHandler` resource-based ownership check + EF Core Global Query Filter (`e.TenantId == currentTenant`). | Cross-tenant integration test suite executes every route with Tenant A token against Tenant B resource IDs. |

> 📐 **Derive It (Fermi Mode): Regex Catastrophic Backtracking CPU DoS**
> - **Inputs**: `EvilStringLength = 32`, `BacktrackingSteps = 2^32`, `OperationsPerSecPerCore = 500000000`
> - **Formula**: `CoreFreezeTimeSec = (2 ^ EvilStringLength) / OperationsPerSecPerCore`
> - **Step-by-Step**:
>   1. A vulnerable regular expression `^([a-zA-Z0-9]+)+$` evaluated against a 32-character string ending in `!` explores $2^{32} = 4,294,967,296$ backtracking paths.
>   2. At $5 \times 10^8$ regex state transitions/sec per vCore, a single 32-byte HTTP request freezes 1 CPU core at 100% for $\frac{4.29 \times 10^9}{5 \times 10^8} = 8.59\text{ seconds}$!
>   3. Sending just `4 requests/sec` completely pins a 32-vCore production cluster at 100% CPU!
> - **What-If Sensitivity**: Adding `.NET` `RegexOptions.NonBacktracking` switches the engine from backtracking NFA to a deterministic finite automaton (DFA), guaranteeing $O(N)$ linear execution ($32\text{ steps} \approx 0.0001\text{ ms}$) regardless of input length.
