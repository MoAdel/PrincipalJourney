# 05A - Inside OAuth 2.0 & OIDC Protocol Internals

> "Protocols are not abstract diagrams.
>
> They are exact HTTP message exchanges, cryptographic challenges, and metadata discovery pipelines operating across distributed boundaries."

---

# Why This Chapter Exists

When your ASP.NET Core API starts up with:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://id.novacommerce.com";
        options.Audience = "api://novacommerce";
    });
```

What actually happens under the hood?

- How does ASP.NET Core find the token signing keys?
- What is inside the OpenID Connect discovery document (`.well-known/openid-configuration`)?
- How does the `ConfigurationManager<OpenIdConnectConfiguration>` fetch, parse, and refresh metadata?
- How are cryptographic key IDs (`kid`) matched during request execution?

Understanding these internal mechanics is essential for diagnosing startup failures, DNS resolution errors during metadata fetches, and token validation rejections in production.

---

# 1. The OIDC Discovery Handshake (`.well-known/openid-configuration`)

When `options.Authority` is configured, ASP.NET Core immediately sends an outbound HTTP request during the first token validation:

```http
GET https://id.novacommerce.com/.well-known/openid-configuration HTTP/1.1
Host: id.novacommerce.com
Accept: application/json
```

### The Discovery Document Response:
```json
{
  "issuer": "https://id.novacommerce.com",
  "authorization_endpoint": "https://id.novacommerce.com/connect/authorize",
  "token_endpoint": "https://id.novacommerce.com/connect/token",
  "jwks_uri": "https://id.novacommerce.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256", "ES256"],
  "scopes_supported": ["openid", "profile", "email", "api://novacommerce"]
}
```

ASP.NET Core parses this JSON and automatically extracts:
1. The authoritative **`issuer`** against which every incoming token's `iss` claim is verified.
2. The **`jwks_uri`**, which contains the public cryptographic keys used to verify token signatures.

---

# 2. Inside the JSON Web Key Set (`jwks.json`)

Next, the runtime queries the `jwks_uri`:

```http
GET https://id.novacommerce.com/.well-known/jwks.json HTTP/1.1
```

### The JWKS Response:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "nova-signing-key-2026-A",
      "alg": "RS256",
      "n": "u1v8b...[Base64Url Modulus]...",
      "e": "AQAB"
    },
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "nova-signing-key-2026-B",
      "alg": "RS256",
      "n": "x9a2c...[Base64Url Modulus]...",
      "e": "AQAB"
    }
  ]
}
```

### Key Properties:
- **`kty` (Key Type)**: `RSA` or `EC`.
- **`use`**: `sig` (Signature verification).
- **`kid` (Key ID)**: A unique identifier matching the `kid` header inside the incoming JWT.
- **`n` & `e`**: The RSA Public Modulus and Public Exponent.

The .NET runtime converts these Base64Url strings directly into an in-memory `RSACryptoServiceProvider` / `RSA.Create()` instance to verify SHA-256 signatures with zero external network latency on subsequent requests.

---

# 3. Inside `ConfigurationManager<T>` & Metadata Caching

In `Microsoft.IdentityModel.Protocols`, the `ConfigurationManager<OpenIdConnectConfiguration>` manages the metadata lifecycle:

```
ASP.NET Core Startup
         │
         ▼
ConfigurationManager<OpenIdConnectConfiguration>
         │
         ├── Fetch .well-known/openid-configuration
         ├── Fetch .well-known/jwks.json
         │
         ▼
In-Memory Metadata Cache (Default Refresh: 24 Hours)
         │
    [Incoming Request with JWT]
         │
         ├── Extract 'kid' from JWT Header ("nova-signing-key-2026-A")
         │
         ├── Lookup RSA Public Key in Cache
         │
         ├── [Found] ──► Verify Signature In-Memory (< 0.1ms)
         │
         └── [Not Found (Key Rotated!)]
                 │
                 ▼
             Trigger Immediate Metadata Refresh (Throttled: Max 1 per 5 mins)
                 │
                 ▼
             Re-evaluate Signature with New Key
```

### Production Reliability Insight:
Because ASP.NET Core caches signing keys in memory, **a temporary network outage between your Web API and the Identity Provider will NOT cause token validation failures** as long as the in-memory key cache remains valid.

---

# 4. PKCE Math: How SHA-256 Prevents Interception

```
1. Client generates high-entropy random string (43 to 128 chars):
   code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

2. Client calculates Base64Url-encoded SHA-256 hash:
   code_challenge = Base64Url(SHA256(code_verifier))
                  = "E9Melhoa2OwvFrGMTJguCH5rtG6BtWh-rxkhpUx2paA"

3. Auth Server stores (client_id, auth_code, code_challenge, "S256").

4. When token exchange occurs:
   Auth Server computes: Actual = Base64Url(SHA256(received code_verifier))
   If (Actual == code_challenge) -> Issue Tokens!
```

Because SHA-256 is a one-way cryptographic hash, an attacker who intercepts `code_challenge` from the URL cannot reverse it to deduce `code_verifier`.

---

# Self Assessment

1. Why does ASP.NET Core query `/.well-known/openid-configuration` instead of requiring you to hardcode signing keys?
2. What is the role of the `kid` (Key ID) header parameter during asymmetric JWT verification?
3. What happens inside `ConfigurationManager` when an incoming token contains a `kid` that is not currently present in the in-memory cache?
4. Explain how PKCE protects public clients against authorization code interception attacks on mobile devices.
