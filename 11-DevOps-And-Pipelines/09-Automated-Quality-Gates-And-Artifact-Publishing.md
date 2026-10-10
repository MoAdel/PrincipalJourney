# Automated Quality Gates & Artifact Publishing (NuGet / npm / Registries)

> "A build pipeline that produces binaries without verifying architecture rules and publishing immutable versioned packages is only doing half its job."

---

## 1. Architectural Fitness Functions in CI (`NetArchTest`)

In Sprint 01, we established Clean Architecture dependency rules (e.g., Domain must not reference Infrastructure). In CI/CD, we enforce this with automated unit test assertions:

```csharp
[Fact]
public void DomainLayer_MustNotHaveDependenciesOnOtherProjects()
{
    var result = Types.InAssembly(typeof(Order).Assembly)
        .ShouldNot()
        .HaveDependencyOnAny("NovaCommerce.Infrastructure", "NovaCommerce.Api")
        .GetResult();

    Assert.True(result.IsSuccessful, "Domain layer contains forbidden architectural dependencies!");
}
```
If a developer references an infrastructure library from domain logic, **the CI pipeline fails immediately**, preventing architectural decay before code review.

---

## 2. Packaging and Publishing NuGet Artifacts

When building reusable domain libraries or SDKs:

```yaml
- name: Package NuGet Library
  run: |
    dotnet pack src/NovaCommerce.Contracts/NovaCommerce.Contracts.csproj       -c Release       -o ./artifacts       /p:PackageVersion=1.4.${{ github.run_number }}

- name: Publish to Internal NuGet Feed
  run: |
    dotnet nuget push ./artifacts/*.nupkg       --api-key ${{ secrets.AZURE_DEVOPS_NUGET_KEY }}       --source "https://pkgs.dev.azure.com/novacommerce/_packaging/EnterpriseFeed/nuget/v3/index.json"       --skip-duplicate
```
