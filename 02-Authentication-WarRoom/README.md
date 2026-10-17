# Sprint 02 War Room: Authentication, Cryptography & Identity SEV-1 Incidents

> **Companion Track to**: `02-Authentication/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-JWKS-Signing-Key-Rollover-Blackout.md`](./01-Incident-JWKS-Signing-Key-Rollover-Blackout.md) | Unthrottled JWKS metadata fetch on `kid` rotation causing IdP WAF `429` lockout. | Redis Session Cluster CPU spike caused by client login retries. |
| **02** | [`02-Incident-Refresh-Token-Race-Condition-Logout-Storm.md`](./02-Incident-Refresh-Token-Race-Condition-Logout-Storm.md) | Zero-grace-window Refresh Token Reuse Detection revoking legitimate multi-tab users. | SOC alert claiming a 14,000-IP credential replay cyberattack. |
| **03** | [`03-Incident-DataProtection-KeyRing-Desync-MultiPod.md`](./03-Incident-DataProtection-KeyRing-Desync-MultiPod.md) | Ephemeral container `IDataProtectionProvider` KeyRing desync across 30 pods (`29/30` fail). | Ingress Application Gateway header corruption suspicion. |
