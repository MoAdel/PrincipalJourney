# 05 - Cloud Object Storage Architecture: Azure Blob & S3

> "Cloud object storage is not a hierarchical disk file system.
>
> It is an exabyte-scale, distributed key-value store with partition keys, metadata tags, immutability locks, and automated tiering."

---

# Why Should a Principal Engineer Care?

In relational databases, you optimize for index trees and transactions.

In cloud object storage (Azure Blob Storage / AWS S3), you optimize for:
- **Partitioning & Request Throughput**: Poor naming conventions (e.g. sequential integer prefixes `0001_`, `0002_`) cause hot partitions and throttled 503 Server Busy errors.
- **Blob Types**: Selecting the wrong blob type (Block vs Append vs Page) destroys write throughput or makes chunked uploads impossible.
- **FinOps Lifecycle Rules**: Storing petabytes in Hot tier costs $20,000/month; properly tiered to Cold/Archive costs less than $1,800/month.
- **Immutability & Legal Compliance**: WORM (Write Once, Read Many) policies prevent accidental deletion or ransomware modification of financial invoices.

---

# The Three Types of Blobs in Azure Storage

| Blob Type | Max Size | Structure | Ideal Use Case |
|---|---|---|---|
| **Block Blobs** | 190.7 TB | Composed of up to 50,000 discrete blocks (up to 4,000 MB per block). | Images, videos, documents, zip archives, streaming media. **(99% of web applications)** |
| **Append Blobs** | 195 GB | Optimized for fast append-only operations without modifying existing blocks. | Real-time telemetry, crash dumps, audit log streaming. |
| **Page Blobs** | 8 TB | Composed of 512-byte pages optimized for random read/write access. | Azure Virtual Machine VHD disks, database log files. |

---

# Access Tiers & FinOps Cost Optimization

A Principal Engineer establishes automated lifecycle management rules based on access frequency and retrieval costs:

```
┌───────────┬──────────────────────┬──────────────────┬─────────────────┬────────────────────────────────┐
│ Tier      │ Storage Cost (GB/Mo) │ Access Cost (I/O)│ Retrieval Time  │ Ideal Workload                 │
├───────────┼──────────────────────┼──────────────────┼─────────────────┼────────────────────────────────┤
│ **Hot**   │ $$$ (Highest)        │ $ (Lowest)       │ Immediate (ms)  │ Active product images & videos │
│ **Cool**  │ $$                   │ $$               │ Immediate (ms)  │ Invoices (30–90 days old)      │
│ **Cold**  │ $                    │ $$$              │ Immediate (ms)  │ Annual reports (90–180 days)   │
│ **Archive**│ ¢ (Fraction of cent)│ $$$$ (Expensive) │ Hours (Hydrate) │ Legal/Audit archives (7 years) │
└───────────┴──────────────────────┴──────────────────┴─────────────────┴────────────────────────────────┘
```

### Automated Lifecycle Policy (Bicep / Terraform / Azure Portal):
```json
{
  "rules": [
    {
      "name": "InvoiceLifecycleManagement",
      "enabled": true,
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["invoices/"]
        },
        "actions": {
          "baseBlob": {
            "tierToCool": { "daysAfterModificationGreaterThan": 30 },
            "tierToCold": { "daysAfterModificationGreaterThan": 90 },
            "tierToArchive": { "daysAfterModificationGreaterThan": 180 },
            "delete": { "daysAfterModificationGreaterThan": 2555 } // 7 Years
          }
        }
      }
    }
  ]
}
```

---

# Partitioning Strategy: Avoiding Hot Partitions

In Azure Blob Storage, the partition key is derived from the **Account Name + Container Name + Blob Name Prefix**:

### Bad Naming (Hot Partition Risk under 20,000 RPS):
```
// All uploads hit the exact same partition range because prefixes are sequential!
invoices/2026-08-30/00001.pdf
invoices/2026-08-30/00002.pdf
invoices/2026-08-30/00003.pdf
```

### High-Throughput Distributed Naming (Principal Standard):
```
// Prefixing with high-entropy GUID or hash distributes traffic across thousands of storage nodes:
invoices/e4a1b9c3-tenant42-20260830.pdf
invoices/7b8f2d1a-tenant15-20260830.pdf
```

---

# Common Mistakes

❌ **Reading Entire Blobs into Memory Arrays**
```csharp
var response = await blobClient.DownloadContentAsync();
byte[] data = response.Value.Content.ToArray(); // OUT OF MEMORY under load!
```
✅ **Stream directly using `DownloadStreamingAsync()` or return a streaming response.**

❌ **Modifying Blobs by Re-uploading the Entire File**
```csharp
// Re-uploading a 500 MB file to change 10 bytes wastes bandwidth and CPU.
```
✅ **Use Block Blobs to replace specific block IDs, or Append Blobs for logs.**

---

# Architect's Decision

### Scenario
Nova Commerce manages 50 TB of product media and 20 TB of financial invoices.

### Standards Adopted:
1. **Blob Type**: Block Blobs exclusively for all media and document workloads.
2. **Naming**: High-entropy partition keys (`{tenantId}/{blobId:N}/{fileName}`).
3. **Lifecycle**: Automated transition to Cool at 30 days and Archive at 180 days.
4. **Resiliency**: Zone-Redundant Storage (ZRS) in primary region with GRS replication to secondary cloud region.

---

# Learning Resources & References

### Authoritative Documentation
- [Azure Blob Storage Documentation — Microsoft Learn](https://learn.microsoft.com/en-us/azure/storage/blobs/)
- [Optimize costs by automatically managing the data lifecycle](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview)
- [Performance and scalability checklist for Blob storage](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-performance-checklist)
