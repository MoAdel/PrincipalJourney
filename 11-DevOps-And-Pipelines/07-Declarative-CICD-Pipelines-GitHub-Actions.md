# Declarative CI/CD Pipelines with GitHub Actions

> "Continuous Integration is not merely compiling code.
>
> It is an automated contract that enforces compilation, architectural fitness functions, security vulnerability scans, and artifact publishing on every commit."

---

## 1. Enterprise GitHub Actions Pipeline Architecture (.github/workflows/ci-cd.yml)

Here is a comprehensive, production-grade GitHub Actions pipeline implementing matrix testing, package caching, Trivy security scanning, and multi-environment deployment:

```yaml
name: Enterprise Build & Delivery Pipeline

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'src/**'
      - '.github/workflows/ci-cd.yml'
  pull_request:
    branches: [ main ]
    paths:
      - 'src/**'

env:
  REGISTRY: novacommerceacr.azurecr.io
  IMAGE_NAME: production/nova-api
  DOTNET_VERSION: '9.0.x'

jobs:
  # ============================================================================
  # JOB 1: Validation, Architecture Governance & Testing
  # ============================================================================
  build-and-test:
    name: Build & Architecture Quality Gate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup .NET SDK
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Cache NuGet Packages
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: ${{ runner.os }}-nuget-${{ hashFiles('**/Directory.Packages.props', '**/*.csproj') }}
          restore-keys: |
            ${{ runner.os }}-nuget-

      - name: Restore Dependencies
        run: dotnet restore --locked-mode

      - name: Compile Solution (Zero Warnings Tolerance)
        run: dotnet build --no-restore --configuration Release /p:TreatWarningsAsErrors=true

      - name: Execute Unit & Architecture Tests
        run: dotnet test --no-build --configuration Release --verbosity normal --collect:"XPlat Code Coverage"

  # ============================================================================
  # JOB 2: Container Build & Security Vulnerability Gate
  # ============================================================================
  containerize-and-scan:
    name: Container Build & Trivy Security Scan
    needs: [ build-and-test ]
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tag }}
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Generate Immutable Tag
        id: meta
        run: |
          TAG="v1.0.${{ github.run_number }}-${{ github.sha }}"
          echo "tag=$TAG" >> $GITHUB_OUTPUT

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Local Container Image
        uses: docker/build-push-action@v5
        with:
          context: .
          load: true
          tags: ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run Trivy Security Vulnerability Scan (Fail on Critical)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
          format: 'table'
          exit-code: '1' # Fail pipeline if Critical CVE detected!
          ignore-unfixed: true
          severity: 'CRITICAL,HIGH'

      - name: Login to Azure Container Registry
        if: github.ref == 'refs/heads/main'
        uses: azure/docker-login@v2
        with:
          login-server: ${{ env.REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Push Container Image to Registry
        if: github.ref == 'refs/heads/main'
        run: |
          docker tag ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }} ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}

  # ============================================================================
  # JOB 3: Staging Environment Deployment
  # ============================================================================
  deploy-staging:
    name: Deploy to Staging Cluster
    needs: [ containerize-and-scan ]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.novacommerce.com
    steps:
      - name: Deploy to Staging
        run: echo "Deploying image ${{ needs.containerize-and-scan.outputs.image_tag }} to Staging..."

  # ============================================================================
  # JOB 4: Production Gated Deployment
  # ============================================================================
  deploy-production:
    name: Deploy to Production (Manual Approval Gate)
    needs: [ deploy-staging ]
    runs-on: ubuntu-latest
    environment:
      name: production # Requires manual approval in GitHub Environment Settings!
      url: https://api.novacommerce.com
    steps:
      - name: Deploy to Production
        run: echo "Promoting image ${{ needs.containerize-and-scan.outputs.image_tag }} to Production..."
```
