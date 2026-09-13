# Inside B-Tree Page Internals — 8KB Pages, Page Splits & Fill Factor

> **Runtime Deep Dive**: Physical Storage Page Mechanics  
> Why inserting random GUIDs destroys database performance, and the physical reality of 50/50 page splits.

---

## 1. Physical Anatomy of the 8KB Page

In SQL Server and PostgreSQL, the atomic unit of I/O transfer is the **8KB Page (8,192 bytes)**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PAGE HEADER (96 BYTES)                          │
│ • m_pageId: (File:PageNumber)                                          │
│ • m_type: 1 (Data), 2 (Index), 3 (Text/LOB)                            │
│ • m_prevPage / m_nextPage: Doubly linked list pointers                │
│ • m_slotCnt: Number of records in slot array                           │
│ • m_freeCnt: Number of free bytes remaining on page                    │
├────────────────────────────────────────────────────────────────────────┤
│ USER DATA ROWS                                                         │
│                                                                        │
│ Row 0 [Offset: 96]  ──► [Data: 120 Bytes]                              │
│ Row 1 [Offset: 216] ──► [Data: 310 Bytes]                              │
│ Row 2 [Offset: 526] ──► [Data: 85 Bytes]                               │
│ ...                                                                    │
│                                                                        │
│                                     FREE SPACE                         │
├────────────────────────────────────────────────────────────────────────┤
│ SLOT ARRAY (Grows backwards from byte 8191)                           │
│ ... [Slot 2: 526] [Slot 1: 216] [Slot 0: 96]                          │
└────────────────────────────────────────────────────────────────────────┘
```

### The Slot Array & Binary Search
The rows inside a page do not have to be physically contiguous or sorted in place.
Instead, when a row is inserted, the engine appends it to any available free space and updates the **Slot Array** at the end of the page.
The slot array entries are kept strictly in sort order, allowing the CPU to perform an instantaneous in-memory **binary search** within the page.

---

## 2. The Mechanics of a 50/50 Page Split

When you insert a row into a B-Tree, it must be placed into the specific page corresponding to its sort key.

### The "Good" Split (Sequential Append at End of Table)
* If your clustered key is strictly increasing (`BIGINT IDENTITY` or `UUIDv7`):
* New rows always target the **very last page** of the B-Tree.
* When that page becomes full (reaches ~8,060 bytes), the engine simply allocates a **brand-new blank page**, links the `m_nextPage` pointer, and puts the new row there.
* **Cost**: 0 rows are moved. The old page remains 100% full. Fragmentation is 0%.

---

### The "Bad" Split (Random Insertion / GUID Primary Key)
What happens if you use `Guid.NewGuid()` as a clustered primary key?
A random GUID can land anywhere in the B-Tree with equal probability:

```text
Step 1: Row needs to be inserted into Page 104 between Row 14 and Row 15.
Step 2: Page 104 is 100% full (0 bytes free space).
Step 3: The engine is forced to execute an expensive 50/50 PAGE SPLIT:
        a) Allocates a new physical page (Page 218) from disk/extent.
        b) Moves 50% of the rows from Page 104 to Page 218.
        c) Inserts the new row into the appropriate page.
        d) Updates doubly-linked list pointers: Page 103 <-> Page 104 <-> Page 218 <-> Page 105.
        e) Updates parent B-Tree intermediate branch node.
        f) Generates heavy Write-Ahead Log (WAL) traffic for every moved row!
```

```text
BEFORE SPLIT:
Page 104 [Full: 100%] ◄────────────────────────────────────────► Page 105

AFTER 50/50 SPLIT:
Page 104 [Half Empty: 50%] ◄──► Page 218 [Half Empty: 50%] ◄──► Page 105
```

### The Devastating Consequences:
1. **50% Storage Waste**: Instead of 1 full page, you now have 2 half-empty pages.
2. **Buffer Pool Inefficiency**: The Buffer Pool must now load twice as many pages into RAM to read the exact same amount of data, cutting cache hit ratios in half!
3. **Log Throughput Bottleneck**: Every moved row is logged in the transaction log, saturating disk write IOPS.
4. **Physical Disk Fragmentation**: Contiguous sequential reads become scattered random reads across non-adjacent extents.

---

## 3. Fill Factor: The Trade-off

The **Fill Factor** setting instructs the engine how much space to leave free on leaf pages when an index is created or rebuilt:

$$\text{Fill Factor } 80\% = 80\% \text{ Data} + 20\% \text{ Free Space for Future Inserts}$$

### The Principal Trade-Off:
* **The Benefit**: Leaves breathing room on each page. A random insert can land in the 20% free space without triggering an immediate 50/50 page split.
* **The Hidden Cost**:
  - Setting Fill Factor to 80% **wastes 20% of your total Buffer Pool RAM permanently**!
  - 10 million rows that could fit in 100,000 pages now require 125,000 pages.
  - Every sequential scan must read **25% more physical pages from disk**!

> **Principal Directive**:
> Never set a blanket Fill Factor of 80% across the whole database!
> Leave Fill Factor at **100% (default)** for monotonic append tables (Orders, AuditLogs, Invoices).
> Use Fill Factor **85–90%** only on tables that experience unavoidable random mid-table insertions.

---

## 4. The Solution: .NET 9 & UUIDv7

If your architecture mandates GUID primary keys (for client-side ID generation or distributed microservice decoupling), **never use standard random `Guid.NewGuid()` (UUIDv4)**.

### The .NET 9 UUIDv7 Breakthrough:
UUIDv7 embeds a **48-bit UNIX millisecond timestamp** into the most significant bits of the GUID:

```text
┌─────────────────────────┬──────────────┬─────────────────────────┐
│ 48-Bit Timestamp (ms)   │ Version (7)  │ 74 Bits Secure Random   │
│ Monotonically Increasing│ 0111         │ Uniqueness Guarantee    │
└─────────────────────────┴──────────────┴─────────────────────────┘
```

```csharp
// .NET 9 Native Sequential UUIDv7
Guid id = Guid.CreateVersion7();

// Inserts cleanly at the end of the B-Tree like a BIGINT!
// Zero 50/50 page splits, 100% page fullness, 10x faster write throughput!
```
