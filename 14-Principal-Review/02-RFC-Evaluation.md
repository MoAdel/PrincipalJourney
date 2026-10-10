# Evaluating Engineering RFCs: Spotting Hidden Architectural Flaws

> "A junior engineer reviews an RFC for syntax and design patterns.
>
> A Principal Engineer reviews an RFC for what is NOT written: unstated concurrency assumptions, missing failure boundaries, and linear cost scaling."

---

## The Principal RFC Review Checklist (The 8 Invariant Questions)

1. **What happens during partial network failure?**  
   If Service B fails or times out after Service A commits, how is state reconciled? (Is there an Outbox or Saga?)
2. **What is the failure blast radius?**  
   Can a spike in this service exhaust thread pools, database connection pools, or message queues shared by core checkout?
3. **What is the data growth trajectory at $10	imes$ volume?**  
   Will this table require table partitioning? Are shard keys chosen without celebrity hotspots?
4. **How are secrets, tokens, and credentials managed?**  
   Are tokens validated with asymmetric JWKS? Are connection strings fetched from cloud key vaults via managed identities?
5. **How is the system debugged at 3:00 AM?**  
   Does every outbound call propagate W3C distributed trace context (`traceparent`)?
6. **What is the rollback mechanism?**  
   Can this schema migration be deployed backwards-compatibly without downtime?
7. **Are background jobs safe across multi-instance clusters?**  
   Are locks distributed via Redis/SQL or will multiple pods duplicate execution?
8. **What does this cost per active user?**  
   Does cloud infrastructure scale sub-linearly with user growth?
