# Curated Resources & Official References: Cloud Native Azure

This repository of references contains the authoritative, formal standards, specifications, and documentation used to design and validate enterprise cloud-native systems on Azure.

---

## 1. Microsoft Official Architecture Documentation
- **Azure Architecture Center**: [https://learn.microsoft.com/en-us/azure/architecture/](https://learn.microsoft.com/en-us/azure/architecture/)
  - Reference architectures for microservices, event-driven pipelines, and hub-spoke networks.
- **Microsoft Well-Architected Framework (WAF)**: [https://learn.microsoft.com/en-us/azure/well-architected/](https://learn.microsoft.com/en-us/azure/well-architected/)
  - The 5 pillars: Reliability, Security, Cost Optimization, Operational Excellence, Performance Efficiency.
- **Cloud Adoption Framework (CAF) for Azure**: [https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/)
  - Enterprise landing zones, subscription topologies, and management group hierarchies.

---

## 2. Serverless & Distributed Runtime Specifications
- **Azure Functions v4 Isolated Worker Model**: [https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide)
  - Execution model, dependency injection, and middleware pipeline in .NET 9.
- **Azure Functions Flex Consumption Plan**: [https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)
  - Fast scale-out, Always Ready instances, and native virtual network integration.
- **Durable Functions Specification & DTFx**: [https://learn.microsoft.com/en-us/azure/azure-functions/durable/](https://learn.microsoft.com/en-us/azure/azure-functions/durable/)
  - Orchestrator code constraints, replay execution, and entity patterns.
  - GitHub: [https://github.com/Azure/durabletask](https://github.com/Azure/durabletask) (Durable Task Framework core repo).

---

## 3. Container Platforms & CNCF Standards
- **Azure Container Apps Documentation**: [https://learn.microsoft.com/en-us/azure/container-apps/](https://learn.microsoft.com/en-us/azure/container-apps/)
  - KEDA scalers, Envoy sidecar routing, and microservice revisions.
- **KEDA (Kubernetes Event-driven Autoscaling)**: [https://keda.sh/](https://keda.sh/)
  - Official specification for event-driven autoscaling.
- **CNCF Cloud Native Definition**: [https://github.com/cncf/toc/blob/main/DEFINITION.md](https://github.com/cncf/toc/blob/main/DEFINITION.md)
  - Standards for containers, service meshes, microservices, and declarative APIs.

---

## 4. Security & Zero-Trust Standards
- **NIST SP 800-207: Zero Trust Architecture**: [https://csrc.nist.gov/publications/detail/sp/800-207/final](https://csrc.nist.gov/publications/detail/sp/800-207/final)
  - Core tenets of continuous verification, microsegmentation, and dynamic trust evaluation.
- **Azure Private Link & Private Endpoints**: [https://learn.microsoft.com/en-us/azure/private-link/](https://learn.microsoft.com/en-us/azure/private-link/)
  - Secure integration of Azure PaaS services into private virtual networks.

---

## 5. FinOps & Cloud Economics
- **FinOps Foundation Framework**: [https://www.finops.org/framework/](https://www.finops.org/framework/)
  - Inform, Optimize, and Operate phases for enterprise cloud cost management.
- **Azure Cost Management & Billing**: [https://learn.microsoft.com/en-us/azure/cost-management-billing/](https://learn.microsoft.com/en-us/azure/cost-management-billing/)
  - Automated budget alerts, cost allocation rules, and billing anomaly detection.

---

## 6. Recommended Reading for Principal Architects
1. *Designing Distributed Systems* by Brendan Burns (Co-founder of Kubernetes).
2. *Cloud Architecture Patterns* by Bill Wilder (O'Reilly Media).
3. *Enterprise Integration Patterns* by Gregor Hohpe and Bobby Woolf.
4. *Building Microservices (2nd Edition)* by Sam Newman.
