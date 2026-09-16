# Infrastructure as Code: Azure Bicep & Deployment Stacks

> "If your infrastructure cannot be destroyed and completely recreated in a clean region within 30 minutes from version-controlled code, you do not have cloud-native architecture. You have a fragile snowflake server."

---

## 1. Why Azure Bicep Over ARM JSON & Terraform?

| Dimension | ARM JSON | HashiCorp Terraform | Azure Bicep |
|---|---|---|---|
| **Syntax & Readability** | Painful, verbose JSON. | Clean HCL syntax. | Clean, concise, native domain-specific language (DSL). |
| **State Management** | Azure-managed state. | External `terraform.tfstate` file (locking & sync risks). | **Zero State File**. Azure control plane is the single source of truth. |
| **Day-0 Resource Support** | Immediate. | Weeks of delay waiting for provider updates. | **Day-0 Immediate**. All new Azure APIs supported instantly. |
| **Tooling & Validation** | Weak linting. | CLI validate / plan. | Native VS Code extension, deep type-checking, and `bicep what-if`. |

---

## 2. Production Modular Bicep Architecture

```bicep
// main.bicep - Master Infrastructure Orchestrator
targetScope = 'subscription'

param location string = 'eastus'
param environmentName string = 'prod'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-novacommerce-${environmentName}'
  location: location
}

module networkingModule './modules/networking.bicep' = {
  scope: rg
  name: 'networkingDeploy'
  params: {
    location: location
    vnetAddressPrefix: '10.0.0.0/16'
  }
}

module containerAppsModule './modules/container-apps.bicep' = {
  scope: rg
  name: 'containerAppsDeploy'
  params: {
    location: location
    infraSubnetId: networkingModule.outputs.computeSubnetId
  }
}

output acaDefaultDomain string = containerAppsModule.outputs.defaultDomain
```

---

## 3. Azure Deployment Stacks: Preventing Resource Leaks

Traditionally, deleting a resource from an ARM or Bicep template did not delete the resource in Azure; it orphaned it, continuing to bill your account indefinitely!
With **Azure Deployment Stacks**:
* The stack manages the lifecycle of all resources defined in the template.
* **`actionOnUnmanage: 'delete'`**: When you remove a resource from the Bicep template, Azure automatically tears down and deletes the orphaned infrastructure!

---

## 4. Formal & Verified References

* [Microsoft Learn: What is Azure Bicep?](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview)
* [Microsoft Learn: Azure Deployment Stacks Overview](https://learn.microsoft.com/en-us/azure/azure-resource-manager/deployment-stacks/overview)
* [Microsoft Bicep GitHub Repository & Best Practices](https://github.com/Azure/bicep)
