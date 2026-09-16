# Principal Distributed Systems Architectural Defense Scenarios

> "When defending your distributed architecture before the CTO or VP of Infrastructure, you must defend every millisecond of latency and every trade-off on the CAP boundary."

---

### Scenario 1: Defending Against Global Synchronous Replication
**Question**: *"Why can't we just configure our SQL Server to synchronously replicate every transaction between New York and London? Wouldn't that guarantee 100% zero data loss?"*

**Principal Defense**:
> "Synchronous replication over a 5,500 km WAN link is bound by the speed of light in fiber optic glass. A single round trip between New York and London takes approximately 75 to 90 milliseconds under ideal conditions. With TCP ACKs and database commit handshakes, synchronous replication adds at least 150 milliseconds to every single database write. Furthermore, if the transatlantic link experiences transient packet loss or jitter, all writes in New York freeze, dropping availability to zero. We achieve durability by using local synchronous commits with asynchronous cross-region CDC and monotonic fencing tokens."

---

### Scenario 2: Defending the Redlock Fencing Token Requirement
**Question**: *"Our developers say Redis Redlock is 100% reliable for locking. Why are you mandating that our database check a Fencing Token on every update?"*

**Principal Defense**:
> "Redlock only guarantees mutual exclusion if you assume time does not freeze. In production .NET applications running on virtualized cloud hypervisors, processes experience Stop-the-World garbage collection sweeps, CPU throttling, and VM live migrations. If a worker acquires a lock with a 5-second TTL and experiences a 6-second GC pause, its lock expires without its knowledge. Another worker acquires the lock and writes safely. When Worker 1 unfreezes, it acts as a zombie client, corrupting the database. Monotonically increasing fencing tokens allow the database to detect and reject writes from zombie workers."

---

### Scenario 3: Defending PACELC PC/EC vs PA/EL Trade-Offs
**Question**: *"Why do we use two different databases? Why not run everything on Cassandra or everything on SQL Server?"*

**Principal Defense**:
> "Because different business domains have diametrically opposed PACELC requirements. A user wallet or inventory deduction is a PC/EC problem: during a partition, consistency must take precedence over availability, and during normal operation, consistency takes precedence over latency. Using Cassandra for wallets invites split-brain double spending. Conversely, user product browsing, clickstream telemetry, and recommendations are PA/EL problems: 99.999% availability and sub-5ms latency are mandatory, and eventual consistency is entirely acceptable. Aligning the database to the business domain's PACELC classification optimizes both cost and correctness."
