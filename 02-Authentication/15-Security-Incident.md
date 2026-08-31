# 15 - Security Incident Post-Mortem: The Stolen Refresh Token Breach

> "When an incident occurs, amateur teams look for someone to blame.
>
> Principal Engineers conduct a blameless post-mortem, analyze root architectural vulnerabilities, and implement structural defenses that permanently eliminate the attack vector."

---

# Incident Overview

| Field | Detail |
|---|---|
| **Incident Title** | Nova Commerce Cross-Tenant BOLA & Token Replay Breach |
| **Severity** | SEV-1 (Critical Security & Regulatory Incident) |
| **Date / Time** | Tuesday, Aug 25, 2026 — 03:14 UTC to 07:30 UTC |
| **Vulnerabilities Exploited** | API1:2023 (BOLA) & API2:2023 (Broken Authentication / Token Replay) |
| **Financial Impact** | $120,000 in forensic audit fees; emergency customer notification |
| **Incident Commander** | Principal Security Architect |

---

# Attack Timeline

```
03:14 UTC ──► Attacker registers account on Nova Commerce web portal.
03:20 UTC ──► Attacker discovers BOLA flaw on GET /api/v1/orders/{id}.
03:25 UTC ──► Automated Python script begins sequential scraping of orders (ORD-00001 to ORD-85000).
04:00 UTC ──► SOC triggers automated alert on anomalous egress volume.
04:15 UTC ──► SOC disables attacker's user account in SQL database.
04:16 UTC ──► Attacker continues scraping because stateless JWT access token remains valid for 4 hours!
05:00 UTC ──► Principal Security Architect takes command, injects emergency Redis IP block.
05:30 UTC ──► Hotfix deployed with resource-based authorization (OrderOwnershipHandler) and Redis revocation filter.
07:30 UTC ──► Forensics complete; data exfiltration contained; incident closed.
```

---

# Root Cause Analysis (The 5 Whys)

1. **Why was customer data exfiltrated?**  
   Because the attacker queried order endpoints across multiple tenant accounts.
2. **Why did the endpoint allow cross-tenant access?**  
   Because `[Authorize]` only checked if the caller had a valid JWT; it never checked if the caller owned the requested order (BOLA).
3. **Why did disabling the user account in the database fail to stop the attack?**  
   Because the JWT Access Token had an excessive 4-hour expiration lifetime and the API had zero token revocation checking.
4. **Why was the token lifetime 4 hours?**  
   Because developers wanted to avoid implementing single-use refresh token rotation in the mobile and web clients.
5. **Why was this missed before production?**  
   Because the team lacked automated architectural security unit tests enforcing resource-level authorization.

---

# Permanent Corrective Actions

| Action Item | Owner | Target Date | Status |
|---|---|---|---|
| Enforce `OrderOwnershipHandler` resource authorization on all entity endpoints | Lead Architect | Day 0 (Immediate) | ✅ Done |
| Clamp Access Token expiration to 10 minutes | Identity Team | Day 1 | ✅ Done |
| Deploy Redis-backed Distributed Token & User Revocation Middleware | Senior Eng | Day 2 | ✅ Done |
| Implement single-use Refresh Token Rotation with Token Family replay detection | Identity Team | Day 3 | ✅ Done |
| Add CI/CD automated security tests validating BOLA defenses across all routes | QA / SecOps | Day 5 | ✅ Done |
