# 27 - Curated Learning Resources & Authoritative References

> "A Principal Engineer does not rely on hearsay or second-hand blog summaries.
>
> They read official documentation, study runtime source code, and ground their decisions in published industry standards."

---

# 1. Official Microsoft Documentation & Guides

### Core Architecture & Fundamentals
- [ASP.NET Core Fundamentals Overview](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/)
- [Microsoft REST API Guidelines (Official GitHub)](https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md)
- [Clean Architecture & Microservices Architecture e-Book](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/)
- [Azure Architecture Center: Cloud Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
- [Reliability Patterns in Cloud Systems](https://learn.microsoft.com/en-us/azure/architecture/framework/resiliency/design-patterns)

### Diagnostics, Performance & Telemetry
- [High-Performance Logging with LoggerMessage Source Generators](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/logger-message-generator)
- [Diagnostics & Performance Counters in .NET (`dotnet-counters`, `dotnet-dump`)](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/tools-overview)
- [Make HTTP Requests Using IHttpClientFactory in ASP.NET Core](https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory)
- [Building Resilient HTTP Requests with Polly & Microsoft.Extensions.Resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)

---

# 2. .NET Framework Source Code Repositories

Studying official framework source code is the fastest way to understand runtime behavior and design trade-offs:

| Component | Source Code Location |
|---|---|
| **ASP.NET Core Pipeline & Kestrel** | [github.com/dotnet/aspnetcore](https://github.com/dotnet/aspnetcore/tree/main/src) |
| **Dependency Injection Container** | [dotnet/runtime: Microsoft.Extensions.DependencyInjection](https://github.com/dotnet/runtime/tree/main/src/libraries/Microsoft.Extensions.DependencyInjection) |
| **Logging Subsystem** | [dotnet/runtime: Microsoft.Extensions.Logging](https://github.com/dotnet/runtime/tree/main/src/libraries/Microsoft.Extensions.Logging) |
| **Configuration & Options Ecosystem** | [dotnet/runtime: Microsoft.Extensions.Options](https://github.com/dotnet/runtime/tree/main/src/libraries/Microsoft.Extensions.Options) |
| **SocketsHttpHandler & Networking** | [dotnet/runtime: System.Net.Http](https://github.com/dotnet/runtime/tree/main/src/libraries/System.Net.Http) |
| **Exception Handling Middleware** | [dotnet/aspnetcore: ExceptionHandlerMiddlewareImpl.cs](https://github.com/dotnet/aspnetcore/blob/main/src/Middleware/Diagnostics/src/ExceptionHandler/ExceptionHandlerMiddlewareImpl.cs) |

---

# 3. Official RFC & IETF Specifications

- [RFC 7807: Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)
- [RFC 9457: Problem Details for HTTP APIs (Updated Standard)](https://datatracker.ietf.org/doc/html/rfc9457)
- [RFC 9110: HTTP Semantics (Replaces RFC 7231)](https://datatracker.ietf.org/doc/html/rfc9110)
- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [IETF Draft: The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
- [W3C Trace Context Specification (Distributed Tracing)](https://www.w3.org/TR/trace-context/)

---

# 4. Essential Books for Principal Engineers

1. **Designing Data-Intensive Applications** — *Martin Kleppmann*  
   *The definitive guide to reliability, scalability, data modeling, concurrency, and distributed systems.*
2. **Dependency Injection Principles, Practices, and Patterns** — *Mark Seemann & Steven van Deursen*  
   *Deep dive into object composition, interceptors, lifetimes, and anti-patterns.*
3. **Clean Architecture: A Craftsman's Guide to Software Structure and Design** — *Robert C. Martin*  
   *The foundational blueprint for separating domain policies from technical details.*
4. **CLR via C# (4th Edition)** — *Jeffrey Richter*  
   *Mastery of CLR memory management, garbage collection, threading, and runtime internals.*
5. **ASP.NET Core in Action (3rd Edition)** — *Andrew Lock*  
   *Comprehensive, real-world guide to modern ASP.NET Core internal mechanics and web API architecture.*

---

# 5. Diagnostic Tools & Profilers

- **BenchmarkDotNet**: Industry-standard micro-benchmarking library for measuring memory allocations and CPU cycles.
- **dotnet-dump**: Cross-platform CLI tool for capturing and analyzing managed process memory dumps.
- **dotnet-trace**: Performance profiling tool using EventPipe to capture CPU sampling and allocation stacks.
- **dotnet-counters**: Real-time performance monitoring tool for tracking GC rates, thread-pool queues, and request rates.
- **PerfView**: Deep Windows/CLR performance analysis tool for investigating GC pauses and lock contention.
- **NetArchTest.Rules**: Fluent library for writing automated architecture unit tests in CI/CD.

---

# 6. Community & Video Deep Dives

- **Stephen Toub & David Fowler**: Deep dives into ASP.NET Core runtime architecture, `SocketsHttpHandler`, and asynchronous plumbing.
- **Nick Chapsas (Keep Coding / Dometrain)**: Practical modern .NET architecture, zero-allocation patterns, and API best practices.
- **Milan Jovanović**: Clean Architecture, CQRS, and domain-driven design tutorials in .NET.
- **OpenTelemetry Community**: Open standard observability ecosystem documentation and reference implementations.
