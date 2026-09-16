# Cloud Requirements & Composite Availability SLA Sizing

> "A cloud provider does not guarantee your system is available. They guarantee individual services are available within bounded parameters. When you connect 5 services in a chain, your availability drops mathematically."

---

## 1. The Mathematics of Composite SLAs

When an application relies on multiple cloud services in series, the overall availability is the **product of the individual service SLAs**:

$$	ext{Composite SLA} = \prod_{i=1}^{n} 	ext{SLA}_i = 	ext{SLA}_1 	imes 	ext{SLA}_2 	imes \dots 	imes 	ext{SLA}_n$$

### Real-World Example: Serial Dependency Chain
Suppose an e-commerce checkout transaction synchronously touches:
1. **Azure Front Door**: $99.99\%$ ($0.9999$)
2. **Azure API Management**: $99.95\%$ ($0.9995$)
3. **Azure Container Apps**: $99.95\%$ ($0.9995$)
4. **Azure SQL Database (Business Critical)**: $99.99\%$ ($0.9999$)
5. **Azure Key Vault**: $99.99\%$ ($0.9999$)

$$	ext{Composite SLA} = 0.9999 	imes 0.9995 	imes 0.9995 	imes 0.9999 	imes 0.9999 = 0.9987 pprox 99.87\%$$

```text
┌─────────────────────────┬─────────────────────────────┬──────────────────────────┐
│ SLA Percentage          │ Allowed Downtime per Month  │ Allowed Downtime per Year│
├─────────────────────────┼─────────────────────────────┼──────────────────────────┤
│ 99.99% (Four Nines)     │ 4.38 minutes                │ 52.60 minutes            │
│ 99.95% (Three and Half) │ 21.92 minutes               │ 4.38 hours               │
│ 99.90% (Three Nines)    │ 43.83 minutes               │ 8.77 hours               │
│ 99.87% (Composite Calc) │ 56.98 minutes               │ 11.40 hours              │
└─────────────────────────┴─────────────────────────────┴──────────────────────────┘
```

### The Principal Takeaway
To achieve $99.99\%$ at the system level, you cannot rely on synchronous serial dependency chains. You must introduce **parallel redundancy (Active-Active)** and **asynchronous decoupling (Queues / Outbox)**:

$$	ext{Composite Parallel SLA} = 1 - (1 - 	ext{SLA}_1) 	imes (1 - 	ext{SLA}_2)$$

---

## 2. Recovery Time Objective (RTO) vs. Recovery Point Objective (RPO)

```text
       Normal Operation         Disaster Hits           Data Restored         Service Restored
───────────────┼──────────────────────┼───────────────────────┼───────────────────────┼────────► Time
               │◄─────── RPO ────────►│                       │◄──────── RTO ────────►│
               │   Maximum Acceptable │                       │   Maximum Acceptable  │
               │   Data Loss (Time)   │                       │   Downtime (Duration) │
```

* **RTO (Recovery Time Objective)**: The maximum acceptable duration of system unavailability following a disaster (e.g., Target: RTO $< 15	ext{ minutes}$).
* **RPO (Recovery Point Objective)**: The maximum acceptable period of data loss measured in time (e.g., Target: RPO $< 5	ext{ seconds}$).

---

## 3. FinOps Constraints & Egress Cost Economics

Cloud providers do not charge for data entering their datacenters (Ingress is Free). However, **data leaving a datacenter (Egress) incurs severe financial penalties**:

```text
┌───────────────────────────────────────────────┬──────────────────────────┐
│ Network Data Path                             │ Typical Cloud Cost / TB  │
├───────────────────────────────────────────────┼──────────────────────────┤
│ Same Availability Zone (VNet internal)        │ FREE                     │
│ Cross-Availability Zone (Zone-to-Zone)        │ $0.01 per GB ($10 / TB)  │
│ Cross-Region (US-East to EU-Central WAN)      │ $0.02 - $0.035 per GB    │
│ Internet Outbound Egress (Cloud to Public Web)│ $0.087 per GB ($87 / TB) │
└───────────────────────────────────────────────┴──────────────────────────┘
```

A streaming service transferring $500	ext{ TB}$ of media per month across the internet without an edge CDN incurs $\$43,500	ext{/month}$ in pure egress bandwidth taxes.

---

## 4. Formal & Verified References

* [Microsoft Learn: Reliability Pillar - Calculate Composite SLAs](https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics#composite-sla)
* [Microsoft Learn: Cloud Design Patterns: Geode Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/geodes)
* [AWS Well-Architected Framework: Reliability Pillar (RTO and RPO Definitions)](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/)
