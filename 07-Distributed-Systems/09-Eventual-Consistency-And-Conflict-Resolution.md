# Eventual Consistency & Conflict Resolution: Beyond Last-Write-Wins

> "Wall-clock timestamps from NTP servers can jump backwards, drift by seconds, and cause silent data loss under Last-Write-Wins. True distributed consistency requires causal ordering or convergent mathematics."

---

## 1. The Perils of Last-Write-Wins (LWW)

Most naive distributed architectures resolve write conflicts by attaching `DateTime.UtcNow` to records and picking the largest timestamp.

### Why LWW Causes Silent Data Loss
1. **Clock Skew**: Even with NTP, servers in different datacenters routinely drift by $10	ext{ ms} - 250	ext{ ms}$.
2. **Leap Seconds**: NTP daemons occasionally step clocks backward.
3. **The Race Scenario**:
   * Client A at 12:00:00.100 (Clock is fast by 50ms) writes: `Email = "a@test.com"`.
   * Client B at 12:00:00.120 (Clock is accurate) writes: `Email = "b@test.com"`.
   * Under LWW, Client A's write timestamp ($12:00:00.150$) is larger than Client B's ($12:00:00.120$).
   * **Result**: Client B's later write is discarded. The earlier write overwrites the newer write!

---

## 2. Lamport Timestamps & Vector Clocks

To capture true causal relationships without physical clocks, distributed systems use **Vector Clocks**:

```text
Each node i maintains a vector of logical counters V:
1. Before updating local state, node i increments V[i] = V[i] + 1.
2. When sending a message, node i includes its vector V.
3. When receiving a message with vector V_msg, node i updates:
   V[k] = max(V[k], V_msg[k]) for all k.
```

### Causality Detection
* If $V_A \le V_B$ (all components of $A \le B$, and at least one $<$): $A$ **causally preceded** $B$ (No conflict; $B$ overwrites $A$).
* If neither $V_A \le V_B$ nor $V_B \le V_A$: $A$ and $B$ are **concurrent conflicts**. The application must merge them!

---

## 3. Client Consistency Models

```text
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Consistency Model               │ Invariant Guarantee                                    │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Read-Your-Own-Writes            │ A user will always see their own updates immediately,   │
│                                 │ even if reads hit a delayed replica.                   │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Monotonic Reads                 │ If a user sees a particular state, they will never see │
│                                 │ an older state on subsequent queries.                  │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Consistent Prefix Reads         │ If a sequence of writes occurs in order (Q followed by │
│                                 │ A), observers will see Q before A, never A before Q.   │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 4. Formal & Verified References

* [Leslie Lamport (1978): Time, Clocks, and the Ordering of Events in a Distributed System (Communications of the ACM)](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)
* [Werner Vogels (2009): Eventually Consistent (Communications of the ACM)](https://cacm.acm.org/research/eventually-consistent/)
* [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 5: Replication)](https://dataintensive.net/)
