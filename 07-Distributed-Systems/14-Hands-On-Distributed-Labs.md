# Hands-On Distributed Systems Architecture Labs

> "Distributed systems theory without chaos simulation is merely wishful thinking. Run the load, cut the cable, and observe the math."

---

## Lab 1: Cache Stampede Mitigation with XFetch

### Objective
Implement the XFetch probabilistic early expiration algorithm in .NET 9 and stress-test it against a simulated slow database (400ms query latency) under 5,000 concurrent requests.

### Verification Steps
1. Seed a hot key in Redis with a 10-second TTL.
2. Launch Bombardier / k6 to generate 2,000 RPS.
3. Observe with `dotnet-counters`: verify that as TTL nears zero, **exactly one background thread** refreshes the key while remaining 1,999 requests receive sub-millisecond cache hits.
4. Database query count must remain $\le 1$ during the expiration boundary!

---

## Lab 2: Redlock with Monotonic Fencing Tokens

### Objective
Build a distributed lock manager in C# that coordinates access to a simulated shared storage engine.

### Verification Steps
1. Worker A acquires the lock and receives Fencing Token #101.
2. Simulate a 12-second pause in Worker A (via `Thread.Sleep` or debugger pause) exceeding lock TTL.
3. Worker B acquires the lock and receives Fencing Token #102. Worker B successfully writes to storage.
4. Worker A unfreezes and attempts to write with Token #101.
5. Storage rejects Worker A's write because $101 < 102$.

---

## Lab 3: State-Based CRDT PN-Counter with Multi-Node Convergence

### Objective
Implement a multi-node PN-Counter and simulate cross-region replication under dropped and out-of-order network packets.

### Verification Steps
1. Initialize 3 independent nodes: US-East, EU-Central, AP-East.
2. Execute concurrent increments and decrements in all three nodes while disconnected.
3. Simulate network restoration: exchange states in arbitrary order with duplicate packet injection.
4. Verify that all three nodes converge to the exact same scalar value without loss.

---

## Lab 4: Polly v8 Zero-Allocation Resilience Pipeline

### Objective
Construct an enterprise HTTP resilience pipeline combining a Sliding Window Rate Limiter, Timeout, Hedging, and Circuit Breaker using `Microsoft.Extensions.Resilience`.

### Verification Steps
1. Inject 60% failure rates into downstream mock endpoint.
2. Observe circuit state transition from `Closed` to `Open`.
3. Verify that subsequent requests fast-fail in $< 100\mu	ext{s}$ with `BrokenCircuitException`.
4. Allow break duration to elapse; verify `HalfOpen` probe behavior and automated healing.

---

## Lab 5: Atomic Sliding Window Rate Limiter via Redis Lua

### Objective
Deploy and benchmark an atomic sliding-window rate limiter executed in Redis via Lua scripts.

### Verification Steps
1. Configure limit: 100 requests per 10-second window.
2. Send 150 requests within 2 seconds.
3. Verify exactly 100 requests return HTTP 200 and 50 return HTTP 429 with `Retry-After` headers.
