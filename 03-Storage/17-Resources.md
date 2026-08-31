# 17 - Curated Storage & Streaming Learning Resources

> "A Principal Storage Architect relies on low-level runtime networking source code, RFC specifications, and cloud storage benchmarks."

---

# 1. Official Standards & RFC Specifications

### HTTP Streaming & Range Requests
- [RFC 9110: HTTP Semantics (Section 14: Range Requests)](https://datatracker.ietf.org/doc/html/rfc9110#section-14)
- [RFC 7233: Range Requests (Legacy Reference)](https://datatracker.ietf.org/doc/html/rfc7233)
- [The TUS Resumable Upload Protocol v1.0.0 Specification](https://tus.io/protocols/resumable-upload.html)
- [RFC 8297: Early Hints for Asset Preloading](https://datatracker.ietf.org/doc/html/rfc8297)

---

# 2. Microsoft Documentation & Cloud Storage Architecture

### Azure Blob Storage
- [Azure Blob Storage Documentation Overview](https://learn.microsoft.com/en-us/azure/storage/blobs/)
- [Authorize access to blobs using Azure Active Directory (User Delegation SAS)](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-access-azure-active-directory)
- [Optimize costs by automatically managing the data lifecycle](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview)
- [Blob storage performance and scalability checklist](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-performance-checklist)

### High-Performance .NET I/O
- [System.IO.Pipelines: High-Performance I/O in .NET](https://learn.microsoft.com/en-us/dotnet/standard/io/pipelines)
- [Memory, Span, and ReadOnlySequence in .NET](https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/)
- [An Introduction to System.IO.Pipelines — David Fowler](https://devblogs.microsoft.com/dotnet/system-io-pipelines-high-performance-io-in-net/)

---

# 3. Source Code Expeditions

| Component | Source Code Location |
|---|---|
| **System.IO.Pipelines** | [dotnet/runtime: System.IO.Pipelines](https://github.com/dotnet/runtime/tree/main/src/libraries/System.IO.Pipelines) |
| **Azure Storage .NET SDK** | [Azure/azure-sdk-for-net: Azure.Storage.Blobs](https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/storage/Azure.Storage.Blobs) |
| **Kestrel Stream & Socket Transports** | [dotnet/aspnetcore: Kestrel Transport Sockets](https://github.com/dotnet/aspnetcore/tree/main/src/Servers/Kestrel/Transport.Sockets) |

---

# 4. Essential Literature for Storage Architects

1. **Designing Data-Intensive Applications (Part I: Storage and Retrieval)** — *Martin Kleppmann*  
   *The definitive guide to B-Trees, LSM-Trees, append-only logs, and storage engines.*
2. **Writing High-Performance .NET Code (2nd Edition)** — *Ben Watson*  
   *Mastery of buffer pooling, Large Object Heap (LOH) avoidance, and GC allocation profiling.*
3. **Pro .NET Memory Management** — *Konrad Kokosa*  
   *Deepest authoritative dive into CLR memory layouts, spans, memory pools, and garbage collector internals.*

---

# 5. Diagnostic Tools & Benchmarking

- **BenchmarkDotNet**: Measuring throughput and zero-byte allocations for custom stream parsers.
- **PerfView & dotnet-dump**: Inspecting Large Object Heap (LOH) fragmentation and memory leaks.
- **Azure Storage Explorer**: Inspecting block lists, metadata, and SAS generation.
- **Fiddler / Wireshark**: Capturing HTTP 206 Range request byte exchanges and TLS handshakes.
