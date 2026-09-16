# Edge Routing & Global CDN: Azure Front Door Architecture

> "If a client in Singapore connects to a server in Virginia over public transit, every dropped packet takes 220 milliseconds to recover over BGP. Azure Front Door ingests user traffic onto Microsoft's private global WAN within 15 milliseconds."

---

## 1. Split-TCP & Anycast Routing Mechanics

Azure Front Door operates across hundreds of global Points of Presence (PoPs) using **BGP Anycast**:

```text
Without Azure Front Door (Public Internet Transit):
Client (Tokyo) ──(Slow 24-hop BGP Public Internet ~180ms)──► Origin (US-East)
* 3-Way Handshake takes 180ms x 3 = 540ms!
* TLS 1.3 handshake adds another 180ms!
* Packet loss forces full transatlantic TCP window backoff!

With Azure Front Door (Split-TCP Acceleration):
Client (Tokyo) ──(12ms)──► [ AFD PoP Tokyo ] ══(Fast Microsoft Dark Fiber WAN)══► Origin (US-East)
* TCP Handshake terminates locally in Tokyo in 12ms!
* TLS terminates locally in Tokyo in 12ms!
* AFD maintains pre-warmed, persistent TCP connection pools to Origin across private global fiber!
```

---

## 2. Multi-Region Active-Active Routing & Health Probes

```mermaid
flowchart TD
    Client["Global Client"] --> AFD["Azure Front Door (Global Anycast)"]
    
    subgraph PrimaryRegion["Primary: US-East (Weight: 100, Latency: 45ms)"]
        AppUS["App Service / ACA Cluster US"]
    end

    subgraph SecondaryRegion["Secondary: EU-Central (Weight: 100, Latency: 90ms)"]
        AppEU["App Service / ACA Cluster EU"]
    end

    AFD -->|Health Probe: GET /health/ready (200 OK)| AppUS
    AFD -->|Health Probe: GET /health/ready (200 OK)| AppEU

    AFD -->|Routes to Closest Healthy Origin| AppUS
    AppUS -.->|If US fails 3 consecutive probes| Failover[Instant Failover to EU Origin < 5 seconds!]
    Failover -.-> AppEU
```

---

## 3. Web Application Firewall (WAF) OWASP Rulesets

Azure Front Door embeds a managed Web Application Firewall (WAF) operating directly at the edge:
* **Default Rule Set (DRS 2.1)**: Automatically blocks OWASP Top 10 vulnerabilities (SQL Injection, Cross-Site Scripting, Local File Inclusion, Remote Code Execution) **before requests cross into your virtual network**.
* **Bot Protection Rules**: Matches incoming request telemetry against Microsoft Threat Intelligence feeds to drop known credential-stuffing botnets.

---

## 4. Formal & Verified References

* [Microsoft Learn: What is Azure Front Door?](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-overview)
* [Microsoft Learn: Split-TCP Architecture in Azure Front Door](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-routing-architecture)
* [OWASP Core Rule Set (CRS) Official Guidance](https://coreruleset.org/)
