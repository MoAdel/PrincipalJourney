# Sprint 11 Executive Summary & 10 Invariant Laws of Principal DevOps

---

## The 10 Invariant Laws of Principal DevOps Engineering

1. **The Law of the Minimal Layer**: A production container image must contain only the compiled binary and the minimal runtime; SDKs, compilers, and shells have no place in production.
2. **The Law of Deterministic Caching**: Order Dockerfile instructions by change frequency; dependency restoration must always precede application source copying.
3. **The Law of Non-Root Execution**: Never run containers as root; always enforce non-privileged user contexts (`USER $APP_UID`).
4. **The Law of Immutable Tagging**: The `latest` tag is strictly banned in production; all images must be tagged with SemVer and Git commit SHA.
5. **The Law of the Failing Security Gate**: A pipeline that passes when high/critical vulnerabilities are detected is an illusion of security; Trivy/SAST scans must break the build.
6. **The Law of Architectural Fitness**: Enforce architecture boundaries (`NetArchTest`) as automated CI test gates; never rely on manual code reviews to block architectural rot.
7. **The Law of Graceful Termination**: Always use the Exec form (`ENTRYPOINT ["dotnet", "app.dll"]`) to ensure PID 1 handles `SIGTERM` and completes in-flight work before shutdown.
8. **The Law of the Single Artifact**: Compile and package once; promote the exact same immutable container image through Dev, Staging, and Production.
9. **The Law of Gated Production**: Direct unreviewed pushes to production are prohibited; automated testing in staging and manual environment approvals are non-negotiable.
10. **The Law of Zero-Downtime Cutover**: Deployments must utilize Blue/Green or Canary routing with automated health probe rollback loops.
