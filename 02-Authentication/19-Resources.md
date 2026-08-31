# 19 - Curated Security Learning Resources & Authoritative References

> "A Principal Security Architect relies on published cryptographic standards, formal RFC specifications, and validated threat modeling frameworks."

---

# 1. Official Standards & RFC Specifications

### OAuth 2.0 & OpenID Connect
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7636: Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 6819: OAuth 2.0 Threat Model and Security Considerations](https://datatracker.ietf.org/doc/html/rfc6819)
- [RFC 8725: JSON Web Token Best Current Practices (BCP)](https://datatracker.ietf.org/doc/html/rfc8725)
- [OpenID Connect Core 1.0 Specification](https://openid.net/specs/openid-connect-core-1_0.html)

### JSON Web Signature & Encryption (JOSE)
- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 7515: JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
- [RFC 7517: JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517)
- [RFC 7518: JSON Web Algorithms (JWA)](https://datatracker.ietf.org/doc/html/rfc7518)

---

# 2. Microsoft Documentation & Security Architecture

- [Overview of ASP.NET Core Security](https://learn.microsoft.com/en-us/aspnet/core/security/)
- [Authentication in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/)
- [Policy-based authorization in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies)
- [Resource-based authorization in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased)
- [ASP.NET Core Data Protection Overview](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction)
- [Azure Key Vault Security Overview](https://learn.microsoft.com/en-us/azure/key-vault/general/security-features)

---

# 3. OWASP & Industry Threat Modeling

- [OWASP API Security Top 10 (2023 Edition)](https://owasp.org/API-Security/)
- [OWASP Cheat Sheet Series: JSON Web Tokens](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [OWASP Cheat Sheet Series: REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [Microsoft Threat Modeling Tool & STRIDE Methodology](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool)

---

# 4. Essential Literature for Security Architects

1. **OAuth 2 in Action** — *Justin Richer & Antonio Sanso*  
   *The definitive, deep-dive guide to OAuth 2.0 and OIDC protocols, tokens, and threat modeling.*
2. **Identity and Data Security for Web Development** — *Roland Guijt*  
   *Practical guide to modern web and API security, claims, and token management in .NET.*
3. **Designing Data-Intensive Applications (Chapter on Reliability & Security)** — *Martin Kleppmann*  
   *Security and consistency boundaries in distributed systems.*
4. **Security Engineering: A Guide to Building Dependable Distributed Systems** — *Ross Anderson*  
   *The seminal reference on cryptography, protocols, access control, and adversary models.*

---

# 5. Tools & Security Analyzers

- **jwt.io**: Interactive JWT debugger and signature inspector.
- **OWASP ZAP (Zed Attack Proxy)**: Open-source web application security scanner for detecting API vulnerabilities.
- **Postman / Insomnia**: Automated API testing with OAuth 2.0 token acquisition flows.
- **NetArchTest.Rules**: Automated architecture and security rule testing for CI/CD pipelines.
