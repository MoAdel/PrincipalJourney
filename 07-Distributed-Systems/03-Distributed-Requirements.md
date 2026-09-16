# Distributed Systems Requirements & Physical Boundaries

> "Software engineers like to believe the cloud is an infinite virtual abstraction. In reality, distributed systems are governed by the speed of light in vacuum, the thermal limits of silicon, and the unreliability of undersea cables."

---

## 1. Non-Functional SLAs & Distributed Latency Budgets

In a distributed, multi-region architecture, latencies do not add up linearly; they compound at the 99th percentile ($p99$).

```text
┌─────────────────────────┬─────────────────────────────┬──────────────────────────┐
│ Metric                  │ Target Production SLA       │ Breach / Degradation     │
├─────────────────────────┼─────────────────────────────┼──────────────────────────┤
│ Intra-Region API Latency│ p50 < 8ms, p99 < 45ms       │ p99 > 150ms              │
│ Cross-Region Sync (WAN) │ Asynchronous: < 1,500ms     │ > 5,000ms (Failover alert│
│ Availability Budget     │ 99.99% (52.6 min downtime/yr)│ < 99.9% (Financial fine)│
│ Network Partition SLA   │ Zero split-brain data loss  │ Any silent data overwrite│
│ Cache Hit Ratio Ceiling │ > 96.5% overall             │ < 90% (DB IOPS overload) │
└─────────────────────────┴─────────────────────────────┴──────────────────────────┘
```

---

## 2. The Physical Law: Speed of Light and Network RTT

The speed of light in vacuum is $c pprox 300,000	ext{ km/s}$. In optical fiber glass, light travels at approximately $200,000	ext{ km/s}$ ($rac{2}{3}c$).

### Physical Round-Trip Time (RTT) Ceilings
* **Within Same Availability Zone (Same Datacenter)**: $pprox 0.5	ext{ ms} - 1.2	ext{ ms}$.
* **Cross-Zone (e.g., US-East-1a to US-East-1b)**: $pprox 1.5	ext{ ms} - 2.5	ext{ ms}$.
* **Transcontinental (New York to San Francisco $pprox 4,100	ext{ km}$)**: Physical minimum RTT $pprox 41	ext{ ms}$ (Actual real-world: $pprox 70	ext{ ms}$).
* **Transatlantic (New York to London $pprox 5,500	ext{ km}$)**: Physical minimum RTT $pprox 55	ext{ ms}$ (Actual real-world: $pprox 75	ext{ ms} - 90	ext{ ms}$).
* **Transpacific (San Francisco to Tokyo $pprox 8,200	ext{ km}$)**: Physical minimum RTT $pprox 82	ext{ ms}$ (Actual real-world: $pprox 110	ext{ ms} - 140	ext{ ms}$).

### The Principal Takeaway
Any architectural design that requires **synchronous distributed locks or 2-Phase Commit across transatlantic regions** adds at least $150	ext{ ms}$ of unavoidable latency to every user click, purely due to the laws of physics.

---

## 3. The 8 Fallacies of Distributed Computing (Peter Deutsch & James Gosling)

Every critical distributed system failure traces back to an engineer implicitly trusting one of these 8 false assumptions:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. The network is reliable.          (Cables break, switches drop UDP) │
│ 2. Latency is zero.                  (Speed of light enforces delays)  │
│ 3. Bandwidth is infinite.            (WAN pipes saturate under load)   │
│ 4. The network is secure.            (Zero-Trust mTLS is mandatory)    │
│ 5. Topology doesn't change.          (Pods autoscale, IPs reassign)    │
│ 6. There is one administrator.       (Multiple cloud providers & orgs) │
│ 7. Transport cost is zero.           (Serialization & CPU marshalling) │
│ 8. The network is homogeneous.       (Linux, Windows, ARM, x86 mixes)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Formal & Verified References

* [Peter Deutsch & James Gosling: The Eight Fallacies of Distributed Computing](https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing)
* [AWS Architecture: Latency Numbers Every Programmer Should Know (Colin Scott Interactive)](https://colin-scott.github.io/personal_website/research/interactive_latencies.html)
* [Mark Burgess: A Spread-Spectrum Principle for Distributed Systems](https://www.usenix.org/)
