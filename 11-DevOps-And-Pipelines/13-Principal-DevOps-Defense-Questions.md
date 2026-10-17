# 13 — Principal DevOps & CI/CD Architecture Defense Questions

> Practice defending these decisions aloud against an adversarial CTO, CISO, or VP of Engineering.

---

### Question 1: Shell Form vs. Exec Form `ENTRYPOINT` & PID 1 Signal Blackholes
> *"During every Kubernetes rolling update, our API drops 1.5% of active requests with `502 Bad Gateway` and pods take exactly 30 seconds to terminate. Our `GracefulShutdown` `IHostedService` never logs `ApplicationStopping`. Why, and how do you fix it?"*

**Principal Defense**:
1. **The Mechanics**: The `Dockerfile` used Shell Form (`ENTRYPOINT dotnet MyApp.dll`) instead of Exec Form (`ENTRYPOINT ["dotnet", "MyApp.dll"]`).
2. **PID 1 Signal Trapping**: Shell form spawns `/bin/sh -c "dotnet MyApp.dll"` as Linux `PID 1`. When Kubernetes initiates pod termination, `kubelet` sends `SIGTERM` to `PID 1` (`/bin/sh`). Standard `/bin/sh` **does not forward `SIGTERM` to child processes**!
3. **The 30-Second Execution**: `dotnet` never knows it is shutting down. It continues accepting requests until `terminationGracePeriodSeconds` (default `30s`) expires, at which point `kubelet` sends `SIGKILL` (`kill -9`), severing in-flight TCP sockets mid-response.
4. **The Complete Fix**:
   - Switch to Exec Form `ENTRYPOINT ["dotnet", "MyApp.dll"]` so `dotnet` runs directly as `PID 1`.
   - Add a `preStop` lifecycle hook (`sleep 5`) in the K8s manifest because `kubelet` sends `SIGTERM` *concurrently* with `kube-proxy` / Envoy endpoint removal; without a 5-second `preStop` delay, ingress routers continue routing new packets to the pod for 1–3 seconds *after* Kestrel has already closed its listener socket!

---

### Question 2: The FinOps / Cost Defense Axis — Self-Hosted Runners vs. Managed CI
> *"Our GitHub Actions bill hit $18,000/month because 140 engineers run full integration and Docker builds on every commit. Moving to a multi-zone enterprise self-hosted AKS runner cluster with dedicated NVMe nodes will cost $6,500/month in compute plus 0.5 FTE platform maintenance ($7,500/month). Defend the 80%-good alternative at 20% of the cost."*

**Principal Defense**:
1. **Reject Premature Runner Infrastructure**: Spending $14,000/month ($6.5k infra + $7.5k FTE) to save $18,000/month yields negligible net ROI while introducing stateful runner security risks.
2. **The 80%-Good Architecture at 20% Cost ($3,200/month)**:
   - **Step 1 (Concurrency Cancel-In-Progress)**: Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`. Developers pushing 4 rapid fixup commits no longer run 4 parallel pipelines (cuts wasted minutes by **38%** immediately).
   - **Step 2 (Path Filtering & Test Impact Analysis)**: Skip Docker image builds and Testcontainers integration suites on PRs that only touch markdown, frontend assets, or unrelated bounded contexts.
   - **Step 3 (BuildKit Registry Layer Cache & NuGet Locked Cache)**: Mount GitHub Actions cache (`type=gha,mode=max`) and `--locked-mode` NuGet cache so unchanged layers build in `8 seconds` instead of `4 minutes`.
3. **Inflection Point**: Only transition to ephemeral Kubernetes ARC (`actions-runner-controller`) spot-instance runners when monthly managed runner spend exceeds **$25,000/month** *after* caching and concurrency deduplication are exhausted.
