# 06A - Inside the JWT Validation Pipeline & IdentityModel Internals

> "Token validation is not string comparison.
>
> It is an optimized cryptographic pipeline performing SHA-256 hashing, RSA signature decryption, time-window verification, and ClaimsIdentity construction on every HTTP request."

---

# Why This Chapter Exists

When an incoming request reaches:

```http
GET /api/v1/orders HTTP/1.1
Host: api.novacommerce.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

What happens inside the ASP.NET Core `JwtBearerHandler` and Microsoft's `IdentityModel` library?

- How is the bearer token extracted and parsed?
- How does `TokenHandler` verify the RSA signature without allocating excess memory?
- Why did .NET 8 transition from `JwtSecurityTokenHandler` to `JsonWebTokenHandler`?
- How are raw JWT claims transformed into a `ClaimsPrincipal` attached to `HttpContext.User`?

Understanding these low-level mechanics allows you to diagnose authentication performance bottlenecks and troubleshoot cryptographic verification failures.

---

# The Execution Flow of `JwtBearerHandler`

```
Incoming HTTP Request
          │
          ▼
AuthenticationMiddleware (app.UseAuthentication())
          │
          ▼
JwtBearerHandler.HandleAuthenticateAsync()
          │
          ├── 1. Extract 'Authorization: Bearer <token>' Header
          │
          ├── 2. Check if Token is Null/Empty
          │
          ▼
JsonWebTokenHandler.ValidateTokenAsync(token, TokenValidationParameters)
          │
          ├── 3. Read Header (Extract 'alg', 'kid', 'typ')
          │      • Verify 'alg' is in ValidAlgorithms whitelist
          │
          ├── 4. Resolve Signing Key via IssuerSigningKeyResolverUsingConfiguration
          │      • Match 'kid' against cached SecurityKey collection from JWKS
          │
          ├── 5. Cryptographic Signature Verification
          │      • Compute SHA-256 of (Header + "." + Payload)
          │      • Decrypt signature using RSA Public Key
          │      • Verify hashes match exactly!
          │
          ├── 6. Validate Issuer ('iss') against ValidIssuer(s)
          │
          ├── 7. Validate Audience ('aud') against ValidAudience(s)
          │
          ├── 8. Validate Lifetime ('nbf' <= Now + ClockSkew <= 'exp')
          │
          ▼
ClaimsPrincipal Construction
          │
          ├── Create ClaimsIdentity(claims, authenticationType: "AuthenticationTypes.Federation")
          ├── Map standard short-name claims ('sub' ──► ClaimTypes.NameIdentifier)
          │
          ▼
Attach to HttpContext: context.User = claimsPrincipal
          │
          ▼
Return AuthenticateResult.Success(ticket)
```

---

# 1. `JwtSecurityTokenHandler` vs `JsonWebTokenHandler` (.NET 8+)

Historically, .NET used `JwtSecurityTokenHandler`.

In modern .NET 8+, Microsoft introduced **`JsonWebTokenHandler`**, which provides up to **30% faster token validation and 50% fewer heap allocations**:

| Feature | Legacy `JwtSecurityTokenHandler` | Modern `JsonWebTokenHandler` |
|---|---|---|
| **Representation** | Allocates heavyweight `JwtSecurityToken` object | Lightweight `JsonWebToken` struct/class |
| **JSON Parser** | Newtonsoft.Json / custom string tokenizer | High-performance `System.Text.Json` |
| **Memory Span Usage** | String substrings & char arrays | Uses `ReadOnlySpan<byte>` for Base64Url decoding |
| **Asynchronous API** | Synchronous only (`ValidateToken`) | Pure asynchronous API (`ValidateTokenAsync`) |

In modern ASP.NET Core:
```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // JsonWebTokenHandler is the default in .NET 8+
        options.UseSecurityTokenValidators = false; // Ensures JsonWebTokenHandler is used!
    });
```

---

# 2. Signature Verification at the Assembly / Native Layer

How does the CLR actually verify `RS256`?

1. The token's header and payload bytes (`"eyJhb... . eyJzd..."`) are hashed using the OS kernel's hardware-accelerated cryptographic provider (BCrypt / OpenSSL):
   ```csharp
   byte[] hash = SHA256.HashData(headerAndPayloadBytes);
   ```
2. The signature bytes are decoded from Base64Url into a raw 256-byte binary signature.
3. The public RSA key executes `RSA.VerifyHash()`:
   ```csharp
   bool isValid = rsaKey.VerifyHash(
       hash, 
       signatureBytes, 
       HashAlgorithmName.SHA256, 
       RSASignaturePadding.Pkcs1);
   ```
4. If `isValid == false`, the runtime immediately throws a `SecurityTokenInvalidSignatureException` and aborts request execution with `401 Unauthorized`.

---

# 3. Claims Mapping & Claim Type Inbound Mapping

One common source of confusion in ASP.NET Core:

When an IdP sends `"sub": "usr_123"` and `"roles": ["Admin"]`, why does `context.User.Claims` sometimes show:

```
http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier
http://schemas.microsoft.com/ws/2008/06/identity/claims/role
```

### The Mechanism: Legacy Inbound Claim Mapping
By default, legacy ASP.NET Core maps standard OIDC short claim names (`sub`, `role`) into legacy WS-Federation URI strings.

### Principal Recommendation:
Disable legacy claim type mapping to preserve exact JWT claim names:

```csharp
JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
// Or with JsonWebTokenHandler:
options.MapInboundClaims = false;
```

Now, `sub` remains `sub`, and `role` remains `role`, eliminating mapping confusion across your domain and authorization policies.

---

# Self Assessment

1. Explain the performance advantages of `JsonWebTokenHandler` over `JwtSecurityTokenHandler`.
2. Why is `options.MapInboundClaims = false` recommended for modern microservice architectures?
3. What is the role of `ClockSkew` in token lifetime validation, and why should it be reduced from the default 5 minutes in production?
4. How does the cryptographic verification step detect if an attacker modified a single character in the JWT payload?
