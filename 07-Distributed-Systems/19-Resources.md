# Curated Distributed Systems Learning Resources & Authoritative Literature

> "Mastery of distributed systems requires reading the foundational papers that established the mathematical limits of computation."

---

## 1. Foundational Research Papers

* **Eric Brewer (2000, 2012)**:
  * [Towards Robust Distributed Systems (Original CAP Conjecture)](https://people.eecs.berkeley.edu/~brewer/cs262b-2004/PODC-keynote.pdf)
  * [CAP Twelve Years Later: How the "Rules" Have Changed (IEEE Computer)](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)
* **Seth Gilbert & Nancy Lynch (MIT, 2002)**:
  * [Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services (ACM SIGACT)](https://groups.csail.mit.edu/tds/papers/Lynch/MIT-LCS-TR-858.pdf)
* **Daniel J. Abadi (2012)**:
  * [Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story (PACELC - IEEE)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
* **Leslie Lamport (1978, 1998, 2001)**:
  * [Time, Clocks, and the Ordering of Events in a Distributed System (Communications of the ACM)](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)
  * [The Part-Time Parliament (Paxos Original Paper)](https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf)
  * [Paxos Made Simple](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
* **Marc Shapiro et al. (INRIA, 2011)**:
  * [Conflict-Free Replicated Data Types (CRDTs)](https://inria.hal.science/inria-00609399/document)
* **Vattani, Chierichetti, Lowenstein (VLDB, 2015)**:
  * [Optimal Probabilistic Cache Stampede Prevention (XFetch Algorithm)](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf)

---

## 2. Definitive Distributed Systems Literature

* **Martin Kleppmann**: *Designing Data-Intensive Applications: The Big Ideas Behind Reliable, Scalable, and Maintainable Systems* (O'Reilly).
* **Michael Nygard**: *Release It! Design and Deploy Production-Ready Software (2nd Edition)* (Pragmatic Bookshelf).
* **Sukumar Ghosh**: *Distributed Systems: An Algorithmic Approach (2nd Edition)* (CRC Press).
* **Brendan Gregg**: *Systems Performance: Enterprise and the Cloud (2nd Edition)* (Addison-Wesley).

---

## 3. Official Platform & Architecture Specifications

* **Microsoft Azure Architecture Center**:
  * [Cloud Design Patterns Catalog](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
  * [Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
  * [Bulkhead Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
  * [Cache-Aside Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
* **Redis Official Documentation**:
  * [Distributed Locks with Redis (Redlock)](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/)
  * [Redis Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
* **Polly Resilience Library**:
  * [Polly v8 Documentation & Performance Benchmarks](https://www.pollydocs.org/)
