# The CAP Theorem & PACELC: Mathematical Proofs & Trade-Offs

> "You cannot 'choose Consistency and Availability and reject Partition Tolerance'. In the physical universe, network partitions are an unavoidable law of nature. You can only choose how your system behaves when a partition occurs."

---

## 1. Brewer's CAP Theorem: The Formal Mathematical Reality

Formulated by Eric Brewer (2000) and formally proven by Seth Gilbert & Nancy Lynch (MIT, 2002):

```text
                     Consistency (Linearizability)
                                 ▲
                                / \
                               /   \
                              /  *  \
                             /       \
             Availability ◄───────────► Partition Tolerance
```

* **Consistency ($C$)**: Equivalent to **Linearizability**. Every read operation receives the most recent write or an error. All nodes see the exact same data at the exact same physical time.
* **Availability ($A$)**: Every non-failing node returns a non-error response for every received request (no guarantees that it contains the latest write).
* **Partition Tolerance ($P$)**: The network is allowed to drop or delay an arbitrary number of messages between nodes without crashing the cluster.

### The Gilbert & Lynch Proof Summary
Assume two nodes $G_1$ and $G_2$ separated by a network partition (messages cannot pass between them).
1. A client writes $v_1$ to $G_1$.
2. Because of the partition, $G_1$ cannot propagate $v_1$ to $G_2$.
3. Another client reads from $G_2$.
4. **The Dilemma**:
   * If $G_2$ responds with its old value $v_0$, **Consistency is violated**.
   * If $G_2$ blocks, times out, or returns an error, **Availability is violated**.
   * $	herefore$ No distributed system can guarantee both $C$ and $A$ in the presence of $P$.

---

## 2. Abadi's PACELC Theorem: The Complete Picture

Daniel Abadi (2012) pointed out that CAP only describes what happens **during a rare network partition**. What happens during normal operations ($99.9\%$ of the time)?

$$	ext{If Partition }(P) ightarrow 	ext{Choose between Availability }(A)	ext{ or Consistency }(C)$$
$$	ext{Else }(E) ightarrow 	ext{Choose between Latency }(L)	ext{ or Consistency }(C)$$

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PACELC CLASSIFICATION                           │
├────────────────────────────────┬───────────────────────────────────────┤
│ System Type                    │ Real-World Database Examples          │
├────────────────────────────────┼───────────────────────────────────────┤
│ PC / EC                        │ Google Cloud Spanner, CockroachDB,    │
│ (Consistent always, sacrifices │ Microsoft SQL Server (Sync AG)        │
│ latency and availability)      │                                       │
├────────────────────────────────┼───────────────────────────────────────┤
│ PA / EL                        │ Amazon DynamoDB, Apache Cassandra,    │
│ (Available always, optimizes   │ Couchbase (Default), Redis (Replicas) │
│ for lowest latency via LWW)    │                                       │
├────────────────────────────────┼───────────────────────────────────────┤
│ PC / EL                        │ MongoDB (with w:majority read concern),│
│ (Consistent on partition, but  │ PostgreSQL (Sync replication)         │
│ low latency when normal)       │                                       │
├────────────────────────────────┼───────────────────────────────────────┤
│ PA / EC                        │ Bigtable (in certain replicated modes)│
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 3. Azure Cosmos DB: The 5 Consistency Levels

Rather than a binary switch, modern enterprise distributed databases offer a tunable spectrum across the PACELC trade-off curve:

```text
Strong ──► Bounded Staleness ──► Session (Default) ──► Consistent Prefix ──► Eventual
[Highest Consistency / Highest Latency]           [Lowest Consistency / Lowest Latency]
```

1. **Strong**: Linearizable. Reads guaranteed to return the latest committed version. High latency (requires cross-region quorum sync).
2. **Bounded Staleness**: Reads lag behind writes by at most $K$ versions or $T$ seconds (e.g., max 5 seconds or 100 updates).
3. **Session (Default)**: Guarantees **Read-Your-Own-Writes** and **Monotonic Reads** within a single client session token.
4. **Consistent Prefix**: Updates are never seen out of order, but data may lag behind latest state.
5. **Eventual**: Out-of-order reads possible until convergence. Lowest latency and highest throughput.

---

## 4. Formal & Verified References

* [Seth Gilbert and Nancy Lynch: Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services (ACM)](https://groups.csail.mit.edu/tds/papers/Lynch/MIT-LCS-TR-858.pdf)
* [Daniel J. Abadi: Consistency Tradeoffs in Modern Distributed Database System Design (PACELC)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
* [Microsoft Learn: Consistency Levels in Azure Cosmos DB](https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels)
