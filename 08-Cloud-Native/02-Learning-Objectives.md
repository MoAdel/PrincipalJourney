# Learning Objectives & Cloud Architecture Competencies

> "A Senior Engineer knows how to click through the Azure Portal to deploy a container. A Principal Architect designs declarative, zero-trust infrastructure that survives regional outages and optimizes unit economics."

---

## 1. Core Competencies Matrix

| Competency Area | Junior / Mid | Senior Engineer | Principal Software Engineer |
|---|---|---|---|
| **Compute Topology** | Deploys Web Apps via Azure Portal GUI. | Uses Docker containers on Azure App Service or basic AKS. | Evaluates Azure Container Apps (ACA) vs AKS vs Serverless; configures KEDA event-driven autoscaling, memory limits, and cold-start mitigations. |
| **Serverless Architecture** | Writes simple HTTP-triggered functions. | Uses Function triggers and output bindings. | Architects Azure Functions v4 Isolated Worker (.NET 9); masters **Durable Functions** event-sourcing orchestration, replay mechanics, and determinism rules. |
| **Cloud Networking** | Relies on public IP addresses with IP whitelist firewalls. | Configures basic VNets and peering. | Designs Zero-Trust Hub-and-Spoke networks, Private Endpoints (Azure Private Link), Private DNS Zones, and isolates egress traffic via Azure Firewall. |
| **Edge & Gateways** | Calls microservices directly over public URLs. | Places an API Gateway (APIM) in front of APIs. | Engineers multi-region edge routing with Azure Front Door (Anycast + Split-TCP), WAF OWASP rules, and APIM token validation at the edge. |
| **Identity & Secrets** | Stores connection strings in `appsettings.json` or Key Vault. | Uses Key Vault with Client Secret credentials. | Enforces Zero-Secret architecture using Microsoft Entra ID Managed Identities (User/System Assigned) and token exchange endpoints. |
| **Infrastructure as Code** | Writes manual ARM JSON or shell scripts. | Uses basic Terraform or Bicep templates. | Authors modular, idempotent Azure Bicep deployment stacks with what-if CI/CD validation and automated architecture compliance tests. |
| **FinOps & Economics** | Checks cloud bills at end of month. | Rightsizes VMs and deletes unused disks. | Formulates cloud unit economics ($Cost / UserTransaction$), reserves capacity (RI / Savings Plans), and designs automated spending circuit breakers. |

---

## 2. Sprint Milestones & Deliverables

By the end of Sprint 08, you will have designed, implemented, and defended:

1. **Enterprise Hub-and-Spoke Bicep Blueprint**: A complete modular Infrastructure as Code (IaC) deployment with isolated virtual networks, subnets, NSGs, and Private DNS Zones.
2. **Azure Container Apps with KEDA Sizing**: High-throughput microservice hosting with KEDA queue-length scalers and Envoy ingress configuration.
3. **Isolated Worker Durable Function Saga**: An asynchronous long-running order fulfillment orchestrator running on .NET 9 with compensating replay verification.
4. **Zero-Public-IP Security Perimeter**: Private Endpoints for Azure SQL, Key Vault, and Blob Storage with automated private DNS resolution.
5. **Azure API Management & Front Door Pipeline**: Global edge SSL termination, WAF protection, and token validation offloading.
6. **FinOps Cost Governance Model**: Automated cloud spending monitors, anomaly alerts, and unit-cost forecasting models.

---

## 3. Formal & Verified References

* [Microsoft Learn: Microsoft Well-Architected Framework (WAF)](https://learn.microsoft.com/en-us/azure/well-architected/)
* [Microsoft Learn: Azure Architecture Center Cloud Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
* [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final)
* [CNCF: Cloud Native Definition & Landscape](https://github.com/cncf/toc/blob/main/DEFINITION.md)
* [FinOps Foundation: The FinOps Framework](https://www.finops.org/framework/)
