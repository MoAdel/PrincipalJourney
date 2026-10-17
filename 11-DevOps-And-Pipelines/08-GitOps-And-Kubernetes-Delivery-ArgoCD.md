# 08 — GitOps Architecture & Pull-Based Kubernetes Delivery (ArgoCD)

> "If your CI runner has `cluster-admin` credentials to run `kubectl apply` against production, a single compromised npm/NuGet test script owns your entire production cluster."

---

## 1. Push CI/CD vs. Pull GitOps Security Boundary

```text
❌ PUSH MODEL (Anti-Pattern):
[GitHub Actions Runner] ──(Holds Prod Kubeconfig!)──► [Production AKS API Server]

✅ PULL GITOPS MODEL (Principal Standard):
[GitHub Actions Runner] ──(Pushes Image & Opens PR)──► [GitOps Env Repo]
                                                              ▲
[Production AKS Cluster (ArgoCD Agent)] ──(Polls Git Inside)──┘
```

| Dimension | Push-Based CI (`kubectl apply` in CI) | Pull-Based GitOps (ArgoCD / Flux) | Validation & Rollback |
|---|---|---|---|
| **Blast Radius of Compromised CI** | **Total**: CI holds god-mode cluster credentials. | **Zero Cluster Access**: CI only writes to container registry and Git. | Audit RBAC: zero external ServiceAccounts have write access to prod namespaces. |
| **Configuration Drift Detection** | **Blind**: Manual `kubectl edit` goes unnoticed until next deploy. | **Continuous**: Reconciliation loop detects and self-heals drift every 3 minutes. | Enable `selfHeal: true` and alert on `OutOfSync` status > 5m. |
| **Rollback Mechanics** | Re-run old pipeline job (slow, may fail if external state changed). | `git revert <commit>` or `argocd app rollback` (instant, deterministic). | Test rollback under load during pre-release GameDay. |

---

## 2. Production ArgoCD `Application` & Progressive Rollout (`Rollout`)

Combine ArgoCD with **Argo Rollouts** to automate canary metric verification against Prometheus before shifting 100% of traffic:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: order-processing-api
  namespace: prod-commerce
spec:
  replicas: 12
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: order-processing-api
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 3m }
        - analysis:
            templates:
              - templateName: slo-error-and-latency-gate
        - setWeight: 25
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: slo-error-and-latency-gate
        - setWeight: 100
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: slo-error-and-latency-gate
  namespace: prod-commerce
spec:
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.995
      failureLimit: 2
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_server_request_duration_seconds_count{app="order-processing-api",http_response_status_code!~"5.."}[2m]))
            /
            sum(rate(http_server_request_duration_seconds_count{app="order-processing-api"}[2m]))
```
