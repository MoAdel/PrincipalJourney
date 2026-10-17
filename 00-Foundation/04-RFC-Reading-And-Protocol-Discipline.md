# 04 — RFC-Reading & Protocol Discipline for Principal Engineers

> "Blog posts teach you how someone thought a protocol worked in 2019. IETF RFCs tell you the exact state machine, edge cases, and security invariants that every compliant proxy, browser, and runtime on Earth is contractually bound to obey."

---

## 1. Why Principals Read Primary Specifications

When debugging a sporadic HTTP `400 Bad Request` behind Azure Front Door, an OAuth2 refresh token loop, or a gRPC stream reset under Envoy, secondary tutorials fail you. A Principal Engineer goes straight to the normative specification.

### The Core Principal RFC Canon

| RFC / Spec | Title | Sprint Mapping | Critical Section Every Principal Must Know |
|---|---|---|---|
| **RFC 2119 / 8174** | Key words for use in RFCs | Sprint 00 | Exact legal distinction between `MUST`, `SHOULD`, and `MAY`. |
| **RFC 9110** | HTTP Semantics (obsoletes 7231) | Sprint 01, 03, 08 | Section 9.2.2 (Idempotent Methods), Section 14 (Range Requests), Section 15 (Status Codes). |
| **RFC 9113 / 9114** | HTTP/2 & HTTP/3 (QUIC) | Sprint 01, 08 | Stream multiplexing, head-of-line blocking (TCP vs QUIC), `GOAWAY` graceful connection drain. |
| **RFC 9457** | Problem Details for HTTP APIs (obsoletes 7807) | Sprint 01 | Standard `application/problem+json` schema (`type`, `title`, `status`, `detail`, `instance`). |
| **RFC 6749 / 9700** | OAuth 2.0 & Security Best Current Practice | Sprint 02 | Deprecation of Implicit/ROPC flows, mandatory PKCE (RFC 7636), Refresh Token Rotation. |
| **RFC 7515 / 7519** | JSON Web Signature (JWS) & JWT | Sprint 02 | `alg: none` / RS256-to-HS256 key confusion attacks, `kid` header JWKS rotation, clock skew (`nbf`/`exp`). |
| **RFC 8628** | OAuth 2.0 Device Authorization Grant | Sprint 02 | Polling intervals, `authorization_pending` vs `slow_down` (+5s penalty rule). |
| **W3C Trace Context** | `traceparent` & `tracestate` headers | Sprint 09 | 55-character hex format (`00-<32-hex-trace-id>-<16-hex-span-id>-<2-hex-flags>`). |

---

## 2. How to Dissect an IETF RFC in 15 Minutes

Do not read an RFC linearly from page 1 to page 120. Use this 4-pass extraction protocol:

### Pass 1: Normative Keywords (`RFC 2119`)
* **`MUST` / `SHALL` / `REQUIRED`**: Absolute protocol invariant. Violating this breaks interoperability or creates a CVE.
* **`SHOULD` / `RECOMMENDED`**: Valid reasons may exist in specific architectures to ignore this, but the full second-order implications must be understood and documented in an ADR before deviating.
* **`MAY` / `OPTIONAL`**: Vendor-specific extension territory; never assume a downstream proxy or client implements `MAY` features unless explicitly negotiated.

### Pass 2: ABNF Grammar & Wire Framing
RFCs define wire formats using **Augmented Backus-Naur Form (ABNF, RFC 5234)**. Reading ABNF tells you immediately what your parser must accept and reject.

```abnf
; Example from W3C Trace Context / RFC style ABNF:
traceparent = version "-" trace-id "-" parent-id "-" trace-flags
version     = 2HEXDIG   ; "00" is current version; "ff" is invalid
trace-id    = 32HEXDIG  ; MUST NOT be all zeroes (00000000000000000000000000000000)
parent-id   = 16HEXDIG  ; MUST NOT be all zeroes (0000000000000000)
trace-flags = 2HEXDIG   ; bit 0 = sampled (01)
```

**Principal Takeaway**: A 3-line ABNF block immediately reveals three unit tests most developers miss:
1. `version == "ff"` must be rejected.
2. `trace-id` of 32 zeros must be rejected as invalid.
3. Uppercase hex characters (`A-F`) in `traceparent` are non-compliant (spec specifies lowercase `0-9a-f`).

### Pass 3: Protocol State Machine & Error Transitions
Always sketch the state transitions for error and timeout paths, not just the happy path:
* What happens when an HTTP/2 server sends a `GOAWAY` frame while a client has 50 in-flight `POST` requests? (Answer in **RFC 9113 Section 6.8**: The server includes the `Last-Stream-ID` it will process; streams with higher IDs were definitely not processed and can be safely retried even if non-idempotent!).

### Pass 4: The "Security Considerations" Section
Every IETF RFC is required to have a **Security Considerations** section near the end. This section is a goldmine written by protocol cryptographers listing every known attack vector (timing attacks, replay amplification, header smuggling, token leakage) and the exact normative countermeasures.

---

## 3. Case Study: Translating RFC 9110 & RFC 8628 Directly into C# Invariants

```csharp
using System;
using System.Net;
using System.Net.Http;

namespace PrincipalJourney.Foundation.Protocols;

/// <summary>
/// Demonstrates translating RFC 9110 Section 9.2.2 (Idempotent Methods) and
/// Section 15.6.4 (503 Service Unavailable + Retry-After) into a safe retry policy.
/// </summary>
public static class Rfc9110ComplianceGuard
{
    // RFC 9110 Section 9.2.2: GET, HEAD, OPTIONS, TRACE, PUT, and DELETE are idempotent.
    // POST and PATCH are NOT idempotent unless accompanied by an Idempotency-Key header (draft-ietf-httpapi-idempotency-key-header).
    public static bool CanSafelyRetryWithoutSideEffects(HttpRequestMessage request)
    {
        var method = request.Method;

        if (method == HttpMethod.Get ||
            method == HttpMethod.Head ||
            method == HttpMethod.Options ||
            method == HttpMethod.Trace ||
            method == HttpMethod.Put ||
            method == HttpMethod.Delete)
        {
            return true;
        }

        // Non-idempotent methods (POST/PATCH) MUST carry an explicit Idempotency-Key to be automatically retried
        return request.Headers.Contains("Idempotency-Key");
    }
}
```

---

## 4. Formal & Verified References

* [RFC 9110: HTTP Semantics (IETF)](https://datatracker.ietf.org/doc/html/rfc9110)
* [RFC 9457: Problem Details for HTTP APIs (IETF)](https://datatracker.ietf.org/doc/html/rfc9457)
* [RFC 9700: Best Current Practice for OAuth 2.0 Security (IETF)](https://datatracker.ietf.org/doc/html/rfc9700)
* [W3C Recommendation: Trace Context Level 1](https://www.w3.org/TR/trace-context/)
