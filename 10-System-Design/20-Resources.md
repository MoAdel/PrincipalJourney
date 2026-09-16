# Curated Resources & Official References: Large-Scale System Design

This directory contains the foundational, peer-reviewed research papers, industry classics, and formal specifications that define modern large-scale system design.

---

## 1. Landmark Distributed Systems Research Papers
- **The Google File System (GFS)** (Ghemawat et al., 2003): [https://research.google/pubs/pub51/](https://research.google/pubs/pub51/)
  - Architecture of append-only, fault-tolerant distributed storage.
- **Dynamo: Amazon's Highly Available Key-Value Store** (DeCandia et al., 2007): [https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
  - Consistent hashing, vector clocks, quorum replication, and sloppy quorums.
- **Bigtable: A Distributed Storage System for Structured Data** (Chang et al., 2006): [https://research.google/pubs/pub27898/](https://research.google/pubs/pub27898/)
  - SSTables, Write-Ahead Logs (WAL), and sparse multi-dimensional maps.
- **Spanner: Google's Globally-Distributed Database** (Corbett et al., 2012): [https://research.google/pubs/pub39966/](https://research.google/pubs/pub39966/)
  - External consistency, TrueTime API, and synchronized atomic clocks.
- **In Search of an Understandable Consensus Algorithm (Raft)** (Ongaro & Ousterhout, 2014): [https://raft.github.io/raft.pdf](https://raft.github.io/raft.pdf)
  - Leader election, log replication, and safety proofs.

---

## 2. Essential Books for Principal Architects
1. *Designing Data-Intensive Applications* by Martin Kleppmann (O'Reilly Media).
   - The definitive masterwork on storage engines, replication, partitioning, transactions, and distributed consistency.
2. *System Design Interview – An Insider's Guide (Volume 1 & 2)* by Alex Xu.
   - Rigorous frameworks for capacity estimation, rate limiting, distributed search, and geo-spatial dispatch.
3. *Release It! (2nd Edition)* by Michael Nygard.
   - Circuit breakers, bulkheads, steady-state architecture, and the original Architecture Decision Record (ADR) specification.
4. *Enterprise Integration Patterns* by Gregor Hohpe and Bobby Woolf.
   - Foundational messaging, pipes-and-filters, outbox, and claim-check patterns.

---

## 3. Industry Architecture Blogs & Repositories
- **Netflix Tech Blog**: [https://netflixtechblog.com/](https://netflixtechblog.com/)
  - Real-world high-concurrency microservices, chaos engineering, and video encoding architectures.
- **Uber Engineering Blog**: [https://www.uber.com/blog/engineering/](https://www.uber.com/blog/engineering/)
  - H3 geospatial indexing, marketplace dispatch, and high-throughput Kafka streaming.
- **High Scalability Architecture Archives**: [http://highscalability.com/](http://highscalability.com/)
  - Historical architectural breakdowns of YouTube, Twitter, WhatsApp, and Discord.
- **Architecture Decision Record (ADR) Organization**: [https://adr.github.io/](https://adr.github.io/)
  - Standards and templates for documenting architectural decisions.
