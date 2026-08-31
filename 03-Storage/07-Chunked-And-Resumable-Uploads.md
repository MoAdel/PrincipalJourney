# 07 - Resumable Chunked Upload Protocols (TUS & Block Blobs)

> "Network connections over mobile devices and consumer WiFi are inherently unstable.
>
> An upload architecture that fails completely when a connection drops at 99% is an architectural failure."

---

# Why Should a Principal Engineer Care?

When users upload large assets (500 MB to 5 GB video reviews or bulk archives) over mobile networks:
- Cellular handoffs (5G to LTE to WiFi) cause TCP connection resets.
- If you rely on standard single-request HTTP `POST`, the client must re-upload the entire 5 GB file from byte zero after every disconnect.
- Frustrated users retry repeatedly, multiplying egress and ingress bandwidth by 10x.

As a Principal Engineer, you design a **Resumable Chunked Upload architecture** using:
1. **Azure Block Blobs (Direct PutBlock/PutBlockList)**, or
2. **The TUS Open Protocol (RFC-standardized resumable upload protocol)**.

---

# The Mechanics of Resumable Uploads

```
1. Client splits 100 MB file into 10 MB chunks (Chunk 1 to 10).
2. Upload Chunk 1 (Bytes 0-10MB) ──► Success (Saved on Storage).
3. Upload Chunk 2 (Bytes 10-20MB) ──► Success (Saved on Storage).
4. Upload Chunk 3 (Bytes 20-30MB) ──► [ NETWORK DROPS! ]

5. Client reconnects 10 seconds later:
   Client queries: "What is the latest received byte offset?"
   Storage replies: "Received up to Byte 20,971,520 (Chunk 2)."

6. Client resumes uploading Chunk 3 directly! (Zero data wasted!)
```

---

# Implementing Chunked Uploads in .NET with Azure Storage SDK

```csharp
public async Task UploadLargeFileInChunksAsync(
    BlockBlobClient blobClient, 
    Stream fileStream, 
    int blockSize = 4 * 1024 * 1024 /* 4 MB */)
{
    var blockIds = new List<string>();
    byte[] buffer = ArrayPool<byte>.Shared.Rent(blockSize);

    try
    {
        int bytesRead;
        int blockIndex = 0;

        while ((bytesRead = await fileStream.ReadAsync(buffer.AsMemory(0, blockSize))) > 0)
        {
            // Base64-encoded block ID (must be equal length across all blocks):
            string blockId = Convert.ToBase64String(Encoding.UTF8.GetBytes(blockIndex.ToString("D6")));
            blockIds.Add(blockId);

            using var chunkStream = new MemoryStream(buffer, 0, bytesRead, writable: false);

            // Upload individual block directly to cloud storage:
            await blobClient.StageBlockAsync(blockId, chunkStream);
            blockIndex++;
        }

        // Commit all staged blocks atomically:
        await blobClient.CommitBlockListAsync(blockIds);
    }
    finally
    {
        ArrayPool<byte>.Shared.Return(buffer);
    }
}
```

---

# The Open TUS Protocol (tus.io)

For cross-platform clients (React, iOS, Android, Flutter), the **TUS (Resumable Upload Protocol)** specification standardizes HTTP headers for chunked resumes:

- `POST /files` (Initiates upload with `Upload-Length: 104857600`).
- `PATCH /files/{id}` (Uploads chunk at `Upload-Offset: 20971520`).
- `HEAD /files/{id}` (Queries current offset when connection drops).

---

# Common Mistakes

❌ **Buffering All Chunks on Server Disk Before Uploading to Cloud**
```csharp
// ANTI-PATTERN: Fills local web server disk space and adds double I/O latency.
```
✅ **Stream chunks directly to cloud storage staging pools (`StageBlockAsync`).**

❌ **Using Inconsistent Block ID Lengths**
```csharp
// Azure Storage throws a 400 Bad Request if block ID lengths differ within the same blob.
```
✅ **Format block IDs with fixed width zero-padding: `blockIndex.ToString("D6")`.**

---

# Architect's Decision

### Scenario
Nova Commerce vendors upload multi-gigabyte video catalogs from retail stores with variable mobile internet.

### Decision:
1. **Frontend**: Client-side chunking in 8 MB blocks with local IndexedDB state tracking.
2. **Direct Transport**: Chunks uploaded directly to Azure Storage via `StageBlockAsync` using a scoped write SAS token.
3. **Resumption**: Client fetches staged block list via `GetBlockListAsync()` on reconnect and skips already staged blocks.
4. **Finalization**: Client calls `CommitBlockListAsync()` and notifies the Web API.

---

# Self Assessment

1. Why does resumable chunked uploading dramatically reduce bandwidth waste on mobile networks?
2. How does Azure Storage's `StageBlock` and `CommitBlockList` implement the resumable upload pattern?
3. What is the role of `ArrayPool<byte>.Shared` when processing chunked buffers?
4. How does the TUS protocol use `HEAD` and `PATCH` requests to recover from dropped connections?
