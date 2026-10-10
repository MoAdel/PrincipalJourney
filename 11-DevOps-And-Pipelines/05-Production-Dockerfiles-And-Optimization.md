# Production Multi-Stage Dockerfiles & Layer Caching Optimization

> "Every line in a Dockerfile creates an immutable filesystem layer.
>
> If you order your instructions improperly, a one-line comment change will invalidate your entire dependency cache and force a complete re-download of the internet."

---

## 1. Anatomy of an Enterprise Multi-Stage Dockerfile (.NET 9)

Here is a hardened, production-grade Dockerfile achieving **68 MB image size**, zero vulnerabilities, and non-root execution:

```dockerfile
# ==============================================================================
# STAGE 1: Dependency Restoration (Cached across code changes)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:9.0-noble AS restore-env
WORKDIR /src

# Copy ONLY solution and project files first to maximize layer cache hit ratio!
COPY Directory.Build.props Directory.Packages.props ./
COPY src/*/*.csproj ./
RUN for file in $(ls *.csproj); do mkdir -p src/${file%.*}/ && mv $file src/${file%.*}/; done

# Execute restore; cached unless package dependencies change!
RUN dotnet restore src/NovaCommerce.Api/NovaCommerce.Api.csproj     --locked-mode     --verbosity minimal

# ==============================================================================
# STAGE 2: Compilation & Publication
# ==============================================================================
FROM restore-env AS build-env

# Copy application source code only AFTER restore is cached
COPY src/ ./src/

WORKDIR /src/src/NovaCommerce.Api
RUN dotnet publish NovaCommerce.Api.csproj     -c Release     -o /app/publish     --no-restore     /p:UseAppHost=false

# ==============================================================================
# STAGE 3: Hardened Minimal Runtime (Chiseled Ubuntu / Distroless)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble-chiseled AS final
WORKDIR /app

# Invariant: Run as non-privileged non-root user (UID 1654 in chiseled)
USER $APP_UID

# Copy compiled binaries from build stage only
COPY --from=build-env --chown=$APP_UID:$APP_UID /app/publish .

# Configure production runtime invariants
ENV ASPNETCORE_HTTP_PORTS=8080     DOTNET_EnableDiagnostics=0     DOTNET_TieredPGO=1

EXPOSE 8080

ENTRYPOINT ["dotnet", "NovaCommerce.Api.dll"]
```

---

## 2. Dockerfile Optimization Rules & Invariants

### 1. Invariant: Order by Change Frequency
Docker caches intermediate layers based on the hash of the instruction and files copied. Always order instructions from slowest-changing to fastest-changing:

```text
1. Base Image definition (FROM)            <-- Changes quarterly
2. System packages / tools                 <-- Changes monthly
3. Package manifests (csproj, package.json)<-- Changes weekly
4. Package restore command (dotnet restore)<-- Changes weekly
5. Application source code (COPY src/)     <-- Changes every commit!
6. Compile command (dotnet publish)        <-- Changes every commit!
```

### 2. Invariant: Non-Root Execution (`USER $APP_UID`)
Running a container as `root` (UID 0) means that any Remote Code Execution (RCE) vulnerability allows an attacker to break out into the host kernel with root capabilities. 
- In .NET 8 and 9, `chiseled` images provide built-in non-root user `app` (UID 1654).
- Bind to unprivileged ports ($\ge 1024$), such as port `8080` instead of port `80`.

### 3. Invariant: The `.dockerignore` Guard
Always place a comprehensive `.dockerignore` file in the repository root to prevent copying local garbage into the build context:

```text
**/.git
**/.github
**/.vs
**/.vscode
**/bin
**/obj
**/TestResults
**/*.user
**/*.md
Dockerfile*
.dockerignore
```
