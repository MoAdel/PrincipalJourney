# 06 - JSON Web Tokens (JWT) Cryptographic Internals

> "A JSON Web Token is not an encrypted payload.
>
> It is an open, Base64Url-encoded document whose integrity is protected by a cryptographic signature.
>
> Storing sensitive clear-text secrets in a JWT payload is a critical security vulnerability."

---

# Why Should a Principal Engineer Care?

Most developers treat JWTs as simple strings:

```csharp
var token = Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
var handler = new JwtSecurityTokenHandler();
var jwt = handler.ReadJwtToken(token); // DANGEROUS: Reads payload WITHOUT signature verification!
```

This superficial treatment leads to catastrophic security failures:
1. **Algorithmic Downgrade Attacks (`"alg": "none"`)**: Attackers strip the signature, change `"alg": "none"`, and forge arbitrary admin permissions.
2. **Key Confusion Attacks (HMAC vs RSA)**: An attacker uses an asymmetric RSA public key as an HMAC symmetric secret, tricking a vulnerable server into signing forged tokens.
3. **Information Disclosure**: Developers place internal database connection strings, passwords, or PII into the claims payload.

As a Principal Engineer, you must understand the cryptographic anatomy of JWTs (RFC 7519, RFC 7515) and enforce strict, unbypassable signature verification.

---

# The Anatomy of a JSON Web Token

A JWT consists of three Base64Url-encoded segments separated by dots (`.`):

```
eyJhbGciOiJSUzI1NiIsImtpZCI6IjIwMjYtQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYiLCJuYW1lIjoiSm9obiBEb2UiLCJleHAiOjE3NTY2Mzg0MDB9.signature...
   [ HEADER (Base64Url) ]               .                [ PAYLOAD (Base64Url) ]                .    [ SIGNATURE (Binary) ]
```

### 1. The Header (Metadata)
```json
{
  "alg": "RS256",
  "kid": "nova-signing-key-2026-A",
  "typ": "JWT"
}
```
- **`alg`**: The cryptographic algorithm used to sign the token (`RS256`, `ES256`, `HS256`).
- **`kid`**: The Key ID matching the public key in the JWKS repository.

### 2. The Payload (Claims)
```json
{
  "iss": "https://id.novacommerce.com",
  "aud": "api://novacommerce",
  "sub": "usr_998124",
  "tid": "tenant_enterprise_01",
  "roles": ["StoreAdmin"],
  "permissions": ["orders.read", "orders.refund"],
  "exp": 1756638400,
  "nbf": 1756634800,
  "iat": 1756634800
}
```

### 3. The Signature
```
Signature = Sign_Algorithm(
    Base64Url(Header) + "." + Base64Url(Payload), 
    PrivateKey
)
```

---

# Symmetric (HS256) vs Asymmetric (RS256 / ES256)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Symmetric Signing (HMAC-SHA256 - HS256)                                     │
│                                                                             │
│  • Single Shared Secret Key: Used to both SIGN and VERIFY tokens.           │
│  • Critical Flaw: Every microservice that verifies tokens MUST hold the     │
│    secret. If one microservice is compromised, the attacker can forge       │
│    tokens for the ENTIRE organization.                                      │
│  • Use Case: Single monolithic application only. Forbidden in microservices.│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Asymmetric Signing (RSA / ECDSA - RS256 / ES256)                            │
│                                                                             │
│  • Private Key: Held EXCLUSIVELY by the Identity Provider (Azure Key Vault).│
│  • Public Key: Distributed publicly to all Web APIs via /.well-known/jwks.json.│
│  • Zero Blast Radius: Compromising a Web API only exposes public keys.      │
│    No resource server can forge tokens.                                    │
│  • Principal Standard: Mandatory for all distributed architectures.         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Famous Cryptographic Attack Vectors & Mitigations

### 1. The `"alg": "none"` Downgrade Attack
In vulnerable libraries, setting `"alg": "none"` in the header instructed the parser to skip signature verification entirely. Attackers modified `"roles": ["Admin"]` and submitted the token unsigned.
- **Mitigation**: ASP.NET Core explicitly rejects `"none"` algorithms and requires valid signature keys by default.

### 2. The RSA/HMAC Key Confusion Attack
If a server supports both RS256 and HS256:
1. An attacker grabs the public RSA certificate (`.pem` / `.crt`) from the public JWKS endpoint.
2. The attacker signs a forged token using **HS256 (HMAC)**, passing the **public RSA key as the HMAC shared secret**.
3. The vulnerable server looks up the public key and verifies the HMAC signature using its own public key, accepting the forged token!
- **Mitigation**: Strictly configure the `TokenValidationParameters` to accept **only** asymmetric algorithms:
```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidAlgorithms = [SecurityAlgorithms.RsaSha256, SecurityAlgorithms.EcdsaSha256]
};
```

---

# Robust Token Validation in ASP.NET Core

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://id.novacommerce.com";
        options.Audience = "api://novacommerce";
        options.RequireHttpsMetadata = true;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://id.novacommerce.com",

            ValidateAudience = true,
            ValidAudience = "api://novacommerce",

            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,

            // Enforce maximum 1-minute clock skew (default is 5 mins, which is too loose):
            ClockSkew = TimeSpan.FromMinutes(1),

            // Strictly whitelist allowed signing algorithms:
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256]
        };
    });
```

---

# Common Mistakes

❌ **Calling `JwtSecurityTokenHandler.ReadJwtToken()` for Security Decisions**
```csharp
// DANGEROUS: Decodes JSON but skips signature verification!
var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
var role = jwt.Claims.First(c => c.Type == "role").Value; // UNTRUSTED!
```
✅ **Always use `ValidateToken()` or rely on standard ASP.NET Core Authentication Middleware.**

❌ **Placing Sensitive Data (Passwords, PII) in JWT Claims**
```json
{ "ssn": "123-45-6789", "api_key": "sec_9912" } // VULNERABILITY: JWTs are Base64 encoded, not encrypted!
```
✅ **JWTs are public readable. Store only non-sensitive subject IDs, roles, and identifiers.**

❌ **Setting Generous Expiration Lifetimes on Access Tokens**
```csharp
expires: DateTime.UtcNow.AddDays(30) // CRITICAL FLAW: A stolen token remains valid for a month!
```
✅ **Access tokens must expire in 10 to 15 minutes; use rotating Refresh Tokens for session extension.**

---

# Architect's Decision

### Scenario
Nova Commerce requires token authentication across 25 microservices running in Kubernetes clusters across multiple cloud regions.

### Strategy:
1. **Signing Algorithm**: RS256 with RSA 2048-bit keys (migrating to ES256 P-256 for reduced payload size and faster verification).
2. **Key Storage**: Private keys generated and held strictly within Azure Key Vault HSM.
3. **Public Discovery**: Services fetch and cache public keys via `/.well-known/jwks.json`.
4. **Validation Strictness**: ClockSkew clamped to 60 seconds; explicit algorithm whitelist enforced.

---

# Principal Thinking

| Level | Perspective | Focus |
|---|---|---|
| **Junior** | Payload | "I put the user's role in the JWT payload." |
| **Senior** | Configuration | "I configured `AddJwtBearer` with Issuer and Audience." |
| **Principal** | Cryptographic Trust & Attack Vectors | "How do we prevent algorithm confusion attacks? What is our key rotation overlap window? How do we prevent signature verification from becoming a CPU bottleneck under 50k RPS?" |

---

# Learning Resources & References

### Authoritative Documentation
- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 7515: JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
- [RFC 7517: JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517)
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
