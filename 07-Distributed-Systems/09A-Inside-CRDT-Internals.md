# Inside CRDT Internals: Conflict-Free Replicated Data Types

> "What if distributed state could be merged concurrently across 10 regions without a single lock, without consensus rounds, and with mathematical proof of zero conflict?"

---

## 1. The Mathematics of Semilattices

A Conflict-free Replicated Data Type (CRDT) relies on a mathematical structure called a **Join-Semilattice** $(S, \sqcup)$:
* Any two states $x$ and $y$ can be merged via the join operator: $z = x \sqcup y$.

For the merge to guarantee eventual convergence across arbitrary network delays, the merge function must satisfy three mathematical properties:

1. **Commutative**: $x \sqcup y = y \sqcup x$ (Order of arrival does not matter).
2. **Associative**: $(x \sqcup y) \sqcup z = x \sqcup (y \sqcup z)$ (Message grouping/batching does not matter).
3. **Idempotent**: $x \sqcup x = x$ (Duplicate message delivery has zero effect).

---

## 2. Positive-Negative Counter (PN-Counter) Implementation

A single counter cannot simply increment and decrement, because decrementing violates monotonicity. 
A **PN-Counter** splits the counter into two monotonic vectors: $P$ (Increments) and $N$ (Decrements):

```csharp
public sealed class PnCounter
{
    private readonly string _nodeId;
    private readonly ConcurrentDictionary<string, long> _p = new();
    private readonly ConcurrentDictionary<string, long> _n = new();

    public PnCounter(string nodeId)
    {
        _nodeId = nodeId;
    }

    public void Increment(long value = 1) => _p.AddOrUpdate(_nodeId, value, (_, old) => old + value);
    public void Decrement(long value = 1) => _n.AddOrUpdate(_nodeId, value, (_, old) => old + value);

    // Current State Value
    public long Value => _p.Values.Sum() - _n.Values.Sum();

    // The Merge Function: Join-Semilattice (x ⊔ y)
    public void Merge(PnCounter peer)
    {
        foreach (var (k, v) in peer._p)
            _p.AddOrUpdate(k, v, (_, old) => Math.Max(old, v)); // Commutative, Associative, Idempotent!

        foreach (var (k, v) in peer._n)
            _n.AddOrUpdate(k, v, (_, old) => Math.Max(old, v));
    }
}
```

---

## 3. Observed-Removed Set (ORSet) for E-Commerce Shopping Carts

In an e-commerce shopping cart, a customer might add an item in Region US and remove it in Region EU:
* **The Problem**: If an item is added, removed, and added again, how does the system know the second add is valid?
* **ORSet Solution**: Every `Add` generates a unique UUID tag $(item, 	ext{tag})$. A `Remove` operation removes all currently *observed* tags for that item. A concurrent `Add` generates a fresh tag that was not observed by the remove, preserving the add!

---

## 4. Formal & Verified References

* [Marc Shapiro et al. (2011): A Comprehensive Study of Convergent and Commutative Replicated Data Types (INRIA)](https://inria.hal.science/inria-00555588/document)
* [Martin Kleppmann: Convergence of CRDTs (Cambridge Computer Laboratory)](https://martin.kleppmann.com/)
* [Akka.NET Documentation: Distributed Data & CRDTs](https://getakka.net/articles/clustering/distributed-data.html)
