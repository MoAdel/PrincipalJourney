# 05A - Inside Azure Blob Storage REST Protocol & Block Commit Internals

> "An Azure Block Blob is an in-flight distributed transaction: blocks are staged independently in uncommitted storage, and materialized atomically during a block list commit."

---

# Why This Chapter Exists

When you call:

```csharp
await blobClient.UploadAsync(stream);
```

What actually happens over the wire between your application and the cloud storage frontend?

- How does the Azure Storage REST API split files into discrete blocks?
- What is `PutBlock` vs `PutBlockList`?
- What happens to uncommitted blocks when an upload is aborted halfway through?
- How does optimistic concurrency with `ETag` prevent concurrent overwrite race conditions?

Understanding these internal REST protocol mechanics is essential for building custom resumable upload clients and high-concurrency storage systems.

---

# The Block Blob Staging & Commit Protocol

```
Client App                                                    Azure Storage REST Frontend
    │                                                                      │
    │ 1. PUT /container/video.mp4?comp=block&blockid=AAAA... (Block 1)     │
    │    Content-Length: 4194304 (4MB binary chunk)                        │
    │─────────────────────────────────────────────────────────────────────►│
    │                                                                      │── Stores in Uncommitted
    │ 2. HTTP 201 Created                                                  │   Block Storage Pool
    │◄─────────────────────────────────────────────────────────────────────│
    │                                                                      │
    │ 3. PUT /container/video.mp4?comp=block&blockid=BBBB... (Block 2)     │
    │    Content-Length: 4194304 (4MB binary chunk)                        │
    │─────────────────────────────────────────────────────────────────────►│
    │                                                                      │── Stores in Uncommitted
    │ 4. HTTP 201 Created                                                  │   Block Storage Pool
    │◄─────────────────────────────────────────────────────────────────────│
    │                                                                      │
    │ [ All Chunks Uploaded - Atomic Commit Step ]                         │
    │                                                                      │
    │ 5. PUT /container/video.mp4?comp=blocklist                           │
    │    Body: <BlockList><Latest>AAAA...</Latest><Latest>BBBB...</Latest> │
    │─────────────────────────────────────────────────────────────────────►│
    │                                                                      │── ATOMIC COMMIT:
    │                                                                      │   Assembles Blocks into
    │                                                                      │   Final Blob & Emits ETag
    │ 6. HTTP 201 Created (ETag: "0x8D9A...")                              │
    │◄─────────────────────────────────────────────────────────────────────│
```

---

# 1. `PutBlock` vs `PutBlockList`

1. **`PutBlock` (Staging Phase)**:
   - Uploads a raw binary chunk (up to 4,000 MB in modern Azure Storage).
   - Requires a Base64-encoded `blockid` (must be same length across all blocks in a blob, max 64 bytes).
   - **Crucial Fact**: The blob **does NOT exist yet for readers**. Download attempts return `404 Not Found` until committed!
2. **`PutBlockList` (Commit Phase)**:
   - An atomic REST transaction containing the ordered list of `blockid` values.
   - The storage engine links the blocks together and makes the blob instantly available for download.

---

# 2. Lifecycle of Uncommitted Blocks (Garbage Collection)

What happens if a mobile user loses internet after uploading 50 blocks and never calls `PutBlockList`?

- Azure Blob Storage retains uncommitted blocks in temporary staging storage.
- If `PutBlockList` is not called within **7 days**, Azure's background storage garbage collector **automatically purges all uncommitted blocks**, preventing abandoned storage costs.
- Calling `PutBlockList` immediately deletes any previously staged uncommitted blocks that were not included in the commit list.

---

# 3. Concurrency Control with `ETag` and `If-Match`

When two workers attempt to modify or append to the same blob:

```http
PUT /container/metadata.json?comp=blocklist HTTP/1.1
If-Match: "0x8D9A8F2B1C"
```

If another worker modified the blob in between:
- Azure Storage returns **`HTTP 412 Precondition Failed`**.
- This guarantees zero lost updates in distributed, multi-threaded storage pipelines.

---

# Self Assessment

1. Explain the difference between `PutBlock` and `PutBlockList` in the Azure Storage REST API.
2. Why is a Block Blob invisible to readers until `PutBlockList` is called?
3. How long does Azure retain uncommitted blocks before garbage collecting them?
4. How do `ETag` and `If-Match` headers provide optimistic concurrency protection against simultaneous storage writes?
