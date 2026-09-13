# Relational Engine Architecture — Physical Anatomy & Subsystems

> **Architectural Blueprint: Anatomy of Modern RDBMS (SQL Server & PostgreSQL)**  
> How data moves from client drivers through memory pools, query optimizers, lock managers, and disk subsystems.

---

## 1. High-Level Engine Architecture

To reason about database performance, a Principal Engineer must understand the physical layers of a relational database engine. A database is not simply a disk with tables; it is a **highly sophisticated memory cache and concurrency manager backed by a Write-Ahead Log**.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT APPLICATION (.NET 9)                       │
│      EF Core 9 / Dapper  ──►  Client Driver (Npgsql / SqlClient Pool)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ TDS / Postgres Protocol (TCP Sockets)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RELATIONAL ENGINE                                │
│                                                                             │
│  ┌───────────────────────┐   AST   ┌─────────────────────────────────────┐  │
│  │    Parser & Algebrizer│ ──────► │       Cost-Based Query Optimizer    │  │
│  └───────────────────────┘         │  • Statistics  • Cardinality Est    │  │
│                                    │  • Memo Pruning • Plan Generation   │  │
│                                    └──────────────────┬──────────────────┘  │
│                                                       │ Execution Plan      │
│  ┌────────────────────────────────────────────────────▼──────────────────┐  │
│  │                            Plan Cache                                 │  │
│  └────────────────────────────────────────────────────┬──────────────────┘  │
│                                                       │                     │
│  ┌────────────────────────────────────────────────────▼──────────────────┐  │
│  │                         Query Execution Engine                        │  │
│  │     (Iterators / Volcano Model: Index Seek, Nested Loops, Hash Join)  │  │
│  └──────────┬─────────────────────────────┬──────────────────────────────┘  │
│             │ Requests Pages              │ Requests Locks                  │
│             ▼                             ▼                                 │
│  ┌──────────────────────┐    Hash    ┌───────────────────────────────────┐  │
│  │    Memory Manager    │ ─────────► │           Lock Manager            │  │
│  │ • Workspace Grants   │   Table    │ • S / X / IS / IX / U Locks       │  │
│  │ • Buffer Pool (8KB)  │            │ • Deadlock Detection (Cyclic Wait)│  │
│  └──────────┬───────────┘            └───────────────────────────────────┘  │
│             │ Cache Miss / Flush                                            │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             STORAGE ENGINE                                  │
│                                                                             │
│    ┌──────────────────────────────┐        ┌────────────────────────────┐   │
│    │     Buffer Pool (Data/Index) │        │   Version Store (MVCC/RCSI)│   │
│    │  • 8KB Memory Pages          │        │ • tempdb (SQL Server)      │   │
│    │  • LRU-K Eviction Protocol   │        │ • In-Heap / Undo (Postgres)│   │
│    └──────────────┬───────────────┘        └────────────────────────────┘   │
│                   │                                                         │
│                   │ Lazy Writer (Async Flush)                               │
│                   ▼                                                         │
│    ┌──────────────────────────────┐        ┌────────────────────────────┐   │
│    │       Data Files (.mdf / pg) │        │ Write-Ahead Log (WAL/.ldf) │   │
│    │  • B-Tree Clustered Indexes  │        │ • Sequential Append        │   │
│    │  • Non-Clustered Indexes     │ ◄────  │ • Synchronous Commit       │   │
│    │  • Heap Extents (64KB)       │ Check- │ • Point-in-Time Recovery   │   │
│    └──────────────────────────────┘ point  └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Core Subsystems Dissected

### Subsystem 1: The Connection & Protocol Layer (TDS / Frontend)
* **What it does**: Manages TCP sockets, handles client authentication (TLS, Kerberos, SCRAM-SHA-256), and assigns incoming queries to database worker threads.
* **The Performance Bottleneck**:
  - Each active connection allocates a session descriptor and dedicated memory space (e.g., `work_mem` in PostgreSQL, `Worker Thread` stack in SQL Server: **1 MB to 2 MB per thread**).
  - Having 10,000 active, unpooled connections will crash the database engine from OS thread starvation before a single query even executes!

---

### Subsystem 2: The Relational Engine (Query Lifecycle)
When SQL arrives over the socket:
1. **Parser**: Checks syntax and converts raw text into a Parse Tree.
2. **Algebrizer / Binder**: Resolves object names (tables, columns, data types) against the database metadata catalog.
3. **Cost-Based Query Optimizer (CBO)**:
   - Evaluates hundreds of candidate execution strategies.
   - Reads database **Statistics** (Histograms) to estimate how many rows match each predicate.
   - Selects the cheapest physical execution plan based on estimated I/O and CPU cost.
4. **Plan Cache**: Stores the compiled execution plan. If the exact same query hash arrives later, the engine skips the expensive compilation phase and executes immediately.

---

### Subsystem 3: The Storage Engine & Buffer Pool
Relational databases **NEVER write directly to table data files during transaction execution**:
* **The 8 KB Page Unit**:
  - In SQL Server and PostgreSQL, all physical data is stored in **8 KB pages** (8,192 bytes).
  - 8 contiguous pages form a **64 KB Extent**.
* **The Buffer Pool**:
  - A massive in-memory cache allocating up to 80–90% of total server RAM.
  - When a query requests a row, the engine checks if the 8KB page containing that row is in the Buffer Pool (**Buffer Hit / Logical Read**).
  - If the page is not in memory, the engine issues a synchronous disk read (**Buffer Miss / Physical Read**). Physical reads are **1,000x to 10,000x slower** than logical memory hits!

---

### Subsystem 4: The Write-Ahead Log (WAL / Transaction Log)
How does a database guarantee **Durability (the D in ACID)** without writing data to disk immediately on every transaction?
1. **The WAL Invariant**:
   - When an `INSERT` or `UPDATE` commits, the modified 8KB page is marked **Dirty** in memory.
   - The engine writes the delta change record to the **Write-Ahead Log (WAL / `.ldf`)**.
   - Because log writes are **purely sequential append-only writes**, SSD disk heads or NVMe drives flush them in sub-millisecond latencies.
2. **The Commit Contract**:
   - As soon as the log record is flushed to the WAL on physical disk, the database responds `COMMIT SUCCESSFUL` to the client!
   - The dirty data page remains in memory and is written to the physical `.mdf` file asynchronously later by the background **Checkpoint process** or **Lazy Writer**.
   - If power fails, the engine runs **Crash Recovery** on reboot, rolling forward committed transactions from the WAL and rolling back uncommitted ones.

---

### Subsystem 5: The Lock Manager
* Manages concurrency using an in-memory lock hash table.
* Maps resources (Rows, Keys, Pages, Tables) to granted and waiting lock requests.
* Contains a dedicated background thread that executes every 5 seconds (or milliseconds on contention) to detect **Deadlock cycles** using directed graph cycle detection (Tarjan's algorithm).

---

## 3. Physical Storage Reality: Row Layout & Alignment

Understanding how rows are packed into an 8 KB page reveals why database columns must be designed with architectural precision.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PHYSICAL 8KB PAGE LAYOUT                        │
├────────────────────────────────────────────────────────────────────────┤
│ Page Header (96 Bytes)                                                 │
│ • Page ID, Object ID, PrevPage Pointer, NextPage Pointer, Free Space   │
├────────────────────────────────────────────────────────────────────────┤
│ Data Rows (Row 1, Row 2, Row 3 ... Row N)                              │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Record Header (4B)                                                 │ │
│ │ Fixed-Length Data Columns (e.g., INT=4B, BIGINT=8B, GUID=16B)      │ │
│ │ Null Bitmap (2B + bits for each nullable column)                   │ │
│ │ Variable-Length Column Count (2B)                                  │ │
│ │ Column Offset Array (2B per variable column)                       │ │
│ │ Variable-Length Column Data (VARCHAR, NVARCHAR, VARBINARY)         │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ Free Space                                                             │
├────────────────────────────────────────────────────────────────────────┤
│ Slot Array (Grows backwards from end of page: 2 Bytes per row)         │
│ [Slot 0: Offset 96] [Slot 1: Offset 284] [Slot 2: Offset 412] ...      │
└────────────────────────────────────────────────────────────────────────┘
```

> **Critical Takeaway**:
> An 8 KB page has **8,060 bytes** available for user data after deducting the 96-byte header and slot array.
> If a table row size is **4,050 bytes**, only **1 row** can fit per page! Almost 50% of the page space (4,010 bytes) is wasted as unfillable padding, doubling storage costs and cutting Buffer Pool efficiency in half!
