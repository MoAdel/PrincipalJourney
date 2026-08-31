# 05 - OAuth 2.0 & OpenID Connect Architecture

> "OAuth 2.0 is an authorization delegation framework.
>
> OpenID Connect is an identity authentication layer built on top of OAuth 2.0.
>
> Using OAuth 2.0 for authentication without OIDC is an architectural antipattern."

---

# Why Should a Principal Engineer Care?

In many organizations, developers confuse **Authentication** (AuthN) with **Authorization** (AuthZ).

They use standard OAuth 2.0 access tokens as pseudo-identity tokens, inspect user profile endpoints ad-hoc, or implement legacy flows (like Resource Owner Password Credentials or Implicit Flow) that expose credentials to browser memory.

As a Principal Engineer, you must:
- Select the exact, secure OAuth 2.0 grant flow for each client type (SPA, Native Mobile, Daemon Service).
- Enforce **PKCE (RFC 7636)** for all public clients to prevent authorization code interception attacks.
- Understand the strict architectural boundary between **ID Tokens** (for the client) and **Access Tokens** (for the resource API).
- Structure scopes and claims for least-privilege enterprise governance.

---

# Production Story

Monday.

10:30 AM.

A security vulnerability is discovered in Nova Commerce's legacy mobile app.

The app used the **Resource Owner Password Credentials (ROPC)** flow:

```
Mobile App collects username & password ──► POST /token ──► Backend
```

### The Breach Vector:
1. Because the mobile app directly handled user passwords, it stored them temporarily in device memory.
2. An attacker reverse-engineered the APK, found the hardcoded `client_secret`, and intercepted memory dumps.
3. Furthermore, when corporate enterprise customers tried to enforce **Multi-Factor Authentication (MFA)** and **SAML/FIDO2 Hardware Keys**, the mobile app completely broke because ROPC cannot handle interactive MFA challenges.

The engineering team was forced to migrate to **Authorization Code Flow with PKCE**, redirecting authentication to a standardized system browser session.

---

# The OAuth 2.0 Roles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Resource Owner: The end user who owns the data (e.g. Shopper).           │
│ 2. Client: The application requesting access (e.g. React SPA, iOS App).     │
│ 3. Authorization Server (IdP): Issues tokens after verifying user identity. │
│ 4. Resource Server: The ASP.NET Core Web API hosting protected business data│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# The Protocol Flows Decision Matrix

| Client Type | Security Profile | Mandated Flow | Forbidden Flows |
|---|---|---|---|
| **Single Page App (React / Angular / Blazor WASM)** | Public (Cannot hold secrets) | **Authorization Code Flow with PKCE** | Implicit Flow (Deprecated), ROPC |
| **Native Mobile App (iOS / Android / MAUI)** | Public (Decompilable) | **Authorization Code Flow with PKCE** (via ASWebAuthenticationSession / Custom Tabs) | Implicit Flow, ROPC |
| **Server-Side Web App (ASP.NET Core MVC / Razor)** | Confidential (Secure server storage) | **Authorization Code Flow with Client Secret / mTLS** | Implicit Flow |
| **Daemon / Worker Service (Cron / Queue Consumer)** | Machine-to-Machine | **Client Credentials Flow** (with Client Secret or Private Key JWT) | Auth Code (No user present) |

---

# Authorization Code Flow with PKCE (Step-by-Step)

```
User / Browser               Client (SPA / Mobile)          Auth Server (IdP)          API (Resource Server)
     │                                │                             │                            │
     │ 1. Clicks "Sign In"            │                             │                            │
     │───────────────────────────────►│ 2. Generate code_verifier  │                            │
     │                                │    Compute code_challenge   │                            │
     │                                │    (SHA256 of verifier)     │                            │
     │                                │                             │                            │
     │ 3. Redirect to /authorize with code_challenge                │                            │
     │─────────────────────────────────────────────────────────────►│                            │
     │                                                              │                            │
     │ 4. User Authenticates (Password + MFA + FIDO2)               │                            │
     │◄─────────────────────────────────────────────────────────────│                            │
     │                                                              │                            │
     │ 5. Redirect back to Client with authorization code           │                            │
     │◄─────────────────────────────────────────────────────────────│                            │
     │                                │                             │                            │
     │ 6. Exchange code + code_verifier for tokens                  │                            │
     │    (POST /token)               │                             │                            │
     │                                │────────────────────────────►│ (Verifies challenge ==    │
     │                                │                             │  SHA256(verifier))         │
     │                                │ 7. Returns ID Token +       │                            │
     │                                │    Access Token (+ Refresh) │                            │
     │                                │◄────────────────────────────│                            │
     │                                │                                                          │
     │ 8. API Call with Access Token (Bearer eyJ...)                                             │
     │                                │─────────────────────────────────────────────────────────►│
     │                                │                                                          │ 9. Cryptographically
     │                                │                                                          │    Validates Token
     │                                │ 10. HTTP 200 OK (Orders Data)                            │
     │                                │◄─────────────────────────────────────────────────────────│
```

### Why PKCE Eliminates Authorization Code Interception:
Even if a malicious app on the user's mobile device registers the custom URI scheme and steals the `authorization_code` from step 5, it cannot exchange it for tokens at step 6 because it does not possess the original, high-entropy in-memory **`code_verifier`**.

---

# OpenID Connect (OIDC): ID Token vs Access Token

A common architectural flaw is using the wrong token for the wrong purpose:

| Attribute | ID Token (OIDC) | Access Token (OAuth 2.0) |
|---|---|---|
| **Intended Audience (`aud`)** | The **Client Application** (SPA / Mobile App) | The **Resource Server** (Web API) |
| **Purpose** | Proves user authentication, profile info (name, email) | Authorizes access to protected API resources |
| **Format** | Strictly a formatted **JWT** | Opaque string or structured **JWT** |
| **Usage** | Validated by Client UI to display user profile | Sent in `Authorization: Bearer` header to Web API |
| **API Rule** | **The Web API MUST NEVER accept or validate an ID Token!** | **The Web API validates the Access Token.** |

---

# Scopes vs Roles vs Permissions

A Principal Engineer establishes clean boundaries between these three concepts:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Scope (Client Delegation Boundary):                                      │
│    "What access did the user grant to this specific client application?"    │
│    Examples: 'read:orders', 'write:inventory', 'offline_access'             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Role (Coarse-Grained Organizational Assignment):                         │
│    "What job title / persona does the user have in the company?"            │
│    Examples: 'StoreManager', 'CustomerSupport', 'Customer'                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Permission (Fine-Grained Domain Capability):                             │
│    "Can this user perform this specific atomic action on this resource?"    │
│    Examples: 'orders.refund', 'orders.cancel', 'tenant.export'              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Common Mistakes

❌ **Using Implicit Flow in SPAs or Mobile Apps**
```
// ANTI-PATTERN: Returns access tokens in the browser URL fragment (#access_token=...), exposing tokens to browser history and referer headers.
```
✅ **Use Authorization Code Flow with PKCE.**

❌ **Accepting ID Tokens in the Web API**
```csharp
// DANGEROUS: ID Tokens are issued for the Client UI (aud = client_id), not the API (aud = api://novacommerce).
```
✅ **Enforce Audience Validation (`ValidAudience = "api://novacommerce"`).**

❌ **Storing Long-Lived Refresh Tokens in LocalStorage in SPAs**
```javascript
localStorage.setItem('refreshToken', token); // Vulnerable to Cross-Site Scripting (XSS)
```
✅ **Use Backend-for-Frontend (BFF) pattern with secure HttpOnly SameSite=Strict encrypted cookies.**

---

# Architect's Decision

### Scenario
Nova Commerce needs an identity architecture supporting an internal React Admin Dashboard, a public iOS/Android Consumer App, and 30 backend microservices.

### Decision:
1. **Consumer Mobile & Web SPAs**: Implement **Authorization Code Flow with PKCE** via standard OIDC redirect.
2. **Web Frontend Security**: Deploy a **Backend-For-Frontend (BFF)** gateway (YARP / ASP.NET Core) that stores tokens in secure, encrypted, `SameSite=Strict`, `HttpOnly` session cookies.
3. **Microservices (M2M)**: Enforce **Client Credentials Flow** with private key JWT assertions or Azure Managed Identities.
4. **Token Verification**: Web APIs validate access tokens statelessly using public keys fetched from the IdP's `/.well-known/jwks.json`.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Implementation | "I generated a JWT on user login." |
| **Senior** | Protocol Selection | "I configured OIDC with Authorization Code + PKCE." |
| **Principal** | Identity Architecture & Threat Model | "What is our token audience boundary? How does the BFF pattern protect SPAs from token theft? How are scopes partitioned between client consent and user permissions?" |

---

# Learning Resources & References

### Authoritative Documentation
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7636: Proof Key for Code Exchange (PKCE) by OAuth Public Clients](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Core 1.0 Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Security Best Current Practice (BCP)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
