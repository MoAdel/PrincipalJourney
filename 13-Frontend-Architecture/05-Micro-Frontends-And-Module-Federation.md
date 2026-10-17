# 05 — Micro-Frontends Architecture, Module Federation & Runtime Isolation

> "Splitting a monolithic SPA into 6 Micro-Frontends without shared dependency governance turns a 400KB bundle into a 4.8MB browser memory disaster."

---

## 1. Integration Topologies: Build-Time vs. Runtime Module Federation

```text
                ┌──────────────────────────────────────────────────────┐
                │          APP SHELL (Host Container / Router)         │
                │  • Auth Context (OIDC PKCE)  • Global Telemetry      │
                └──────────┬───────────────────────────────┬───────────┘
                           │ (Lazy Runtime Fetch)          │ (Lazy Runtime Fetch)
              ┌────────────▼────────────┐     ┌────────────▼────────────┐
              │ Remote A: Checkout MFE  │     │ Remote B: Catalog MFE   │
              │ remoteEntry.js          │     │ remoteEntry.js          │
              └─────────────────────────┘     └─────────────────────────┘
```

| Integration Pattern | Bundle Overhead | Deployment Independence | CSS / JS Isolation | Validation & Rollback |
|---|---|---|---|---|
| **NPM Build-Time Packages** | **Lowest** (Tree-shaken once) | **None** (Host must rebuild on every change) | High (Single build pipeline) | Standard CI bundle-size gate (`< 250KB` gzipped). |
| **Webpack / Rspack Module Federation** | **Low–Medium** (`singleton: true` shared libs) | **High** (Independent CDN deploy of `remoteEntry.js`) | Medium (Requires shadow DOM or scoped CSS modules) | Canary CDN manifest switch; rollback manifest JSON in `< 5s`. |
| **Iframes** | **Extreme** (Duplicates full runtime per frame) | **Highest** | **Complete** (Browser sandbox) | Reserve strictly for untrusted 3rd-party compliance widgets (PCI-DSS payment fields). |

> 📐 **Derive It (Fermi Mode): Unshared Runtime Duplication Penalty on Mobile LCP**
> - **Inputs**: `RemotesCount = 5`, `FrameworkSizeGzipKB = 145`, `Mobile3GBandwidthKbps = 1600`, `MainThreadParseMsPerKB = 1.8`
> - **Formula**: `TotalPenaltyMs = RemotesCount * (((FrameworkSizeGzipKB * 8) / Mobile3GBandwidthKbps) * 1000 + (FrameworkSizeGzipKB * MainThreadParseMsPerKB))`
> - **Step-by-Step**:
>   1. If `singleton: true` is omitted, each of the 5 remotes downloads and parses its own copy of Angular/React + RxJS ($5 \times 145\text{ KB} = 725\text{ KB}$ compressed, $\approx 2.4\text{ MB}$ uncompressed JS).
>   2. Network transfer on constrained mobile link: $\frac{725 \times 8}{1,600} = 3.625\text{ seconds}$.
>   3. Main-thread V8 JIT parse/compile stall: $725 \times 1.8\text{ ms} = 1,305\text{ ms}$ ($1.3\text{ seconds}$ Total Blocking Time!).
>   4. Enforcing `singleton: true, strictVersion: false, requiredVersion: '^19.0.0'` cuts transfer + parse time by $80\%$ ($4.93\text{s} \rightarrow 0.98\text{s}$).
> - **What-If Sensitivity**: If one remote upgrades to a breaking major version (`v20.0.0`), `singleton: true` with `strictVersion: true` throws a runtime fatal error. Always validate remote manifest compatibility in CI contract tests before CDN promotion.

---

## 2. Production Module Federation Configuration & Fault Boundary

```typescript
// webpack.config.ts / rspack.config.ts (Host Shell)
import { ModuleFederationPlugin } from '@module-federation/enhanced/webpack';

export default {
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell_host',
      remotes: {
        // Dynamic manifest-driven remote resolution with fallback circuit breaker
        checkout_mfe: 'checkout_mfe@https://cdn.principal.io/mfe/checkout/v2/remoteEntry.js',
      },
      shared: {
        '@angular/core': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
        '@angular/common': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
        'rxjs': { singleton: true, strictVersion: true, requiredVersion: '~7.8.0' },
      },
    }),
  ],
};
```
