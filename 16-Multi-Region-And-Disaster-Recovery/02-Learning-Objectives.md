# 02 — Learning Objectives: Multi-Region Architecture & Disaster Recovery

---

## Principal Competency Matrix

| Competency Area | Senior Engineer Level | Principal Engineer Mastery |
|---|---|---|
| **RPO / RTO Engineering** | Understands definitions of RPO (data loss) and RTO (recovery time). | Quantifies financial cost per minute of downtime vs. infrastructure cost of `RPO=0` sync replication vs. `RPO<5s` async replication. |
| **Topology Selection** | Recommends "Active-Active" for everything. | Selects **Cell-Based / Sharded Active-Active (Write-Pinned per Tenant)** vs. **Warm Standby Active-Passive** based on PACELC consistency invariants. |
| **Failover Mechanics** | Relies on manual runbooks during regional outages. | Designs automated health-probe draining, BGP Anycast / Front Door routing, Fencing Leases, and pre-warmed cache standby capacity. |
| **Verification Discipline** | Runs a tabletop DR discussion once a year. | Executes automated production **DR GameDays** that sever regional ingress and prove `RTO < 3 minutes` under live traffic. |
