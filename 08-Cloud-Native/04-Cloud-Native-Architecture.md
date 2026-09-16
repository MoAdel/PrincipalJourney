# Cloud Native Architecture Blueprint: Hub-and-Spoke Zero-Trust Topology

> "Exposing a managed database to the public internet with an IP whitelist is not a security architecture; it is an open invitation for credential stuffing. Enterprise cloud architecture terminates all traffic inside private virtual networks."

---

## 1. Enterprise Hub-and-Spoke Topology

```mermaid
flowchart TD
    subgraph Internet["Public Ingress Perimeter"]
        User["Client Browser / Mobile"]
        AFD["Azure Front Door (Global Anycast CDN / WAF)"]
    end

    subgraph HubVNet["Hub Virtual Network (10.0.0.0/16)"]
        APIM["Azure API Management (APIM)
(Internal VNet Ingress)"]
        AzFW["Azure Firewall / Central NVA
(Egress Inspection & NAT)"]
        Bastion["Azure Bastion
(Secure Admin Access)"]
    end

    subgraph SpokeCompute["Spoke 1: Compute VNet (10.1.0.0/16)"]
        ACA["Azure Container Apps (ACA)
(KEDA Autoscaling Workload)"]
        Functions["Azure Functions (Flex Consumption)
VNet Integration"]
    end

    subgraph SpokeData["Spoke 2: Data & Secrets VNet (10.2.0.0/16)"]
        PE_SQL["Private Endpoint: Azure SQL
(10.2.1.4)"]
        PE_KV["Private Endpoint: Key Vault
(10.2.1.5)"]
        PE_Storage["Private Endpoint: Blob Storage
(10.2.1.6)"]
        PE_Redis["Private Endpoint: Redis Cache
(10.2.1.7)"]
    end

    User -->|HTTPS :443| AFD
    AFD -->|Private Link Service| APIM

    APIM -->|VNet Peering| ACA
    APIM -->|VNet Peering| Functions

    ACA -->|Private DNS Resolution| PE_SQL
    ACA -->|Private DNS Resolution| PE_KV
    ACA -->|Private DNS Resolution| PE_Storage
    ACA -->|Private DNS Resolution| PE_Redis

    Functions --> PE_SQL

    ACA -.->|Outbound Internet Inspection| AzFW
```

---

## 2. The 4 Network Invariants of Zero-Trust Cloud Architecture

1. **Zero Public IPs on Data Stores**:
   * Azure SQL, Key Vault, Storage, and Redis have `publicNetworkAccess: 'Disabled'`.
   * They can only be reached via internal IP addresses allocated from the `SpokeData` subnet.
2. **Private DNS Zone Auto-Registration**:
   * Internal DNS zones (e.g., `privatelink.database.windows.net`) resolve the database hostname to `10.2.1.4` inside the VNet, while public DNS returns non-routable responses.
3. **VNet Peering Mesh**:
   * Spokes do not peer with each other directly; they peer with the Central Hub. Routing tables (`UDR - User Defined Routes`) force all outbound internet traffic through Azure Firewall.
4. **Network Security Groups (NSGs) as Micro-Perimeters**:
   * Subnet-level NSGs enforce least privilege: `SpokeCompute` is permitted to talk to `SpokeData` on port 1433 (SQL) and 6379 (Redis), but port 22 (SSH) and 3389 (RDP) are permanently blocked.

---

## 3. Formal & Verified References

* [Microsoft Learn: Hub-Spoke Network Topology in Azure](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/hybrid-networking/hub-spoke)
* [Microsoft Learn: Azure Private Link Architecture](https://learn.microsoft.com/en-us/azure/private-link/private-link-overview)
* [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final)
