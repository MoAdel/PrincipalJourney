# 08 — Production EF Core Migration Bundles & CI Schema Linting Gates

---

## 1. Why `db.Database.MigrateAsync()` in `Program.cs` Is Forbidden in Production

1. **Multi-Replica Race Conditions**: When Kubernetes scales 20 pods simultaneously, 20 instances race to query and mutate `__EFMigrationsHistory`.
2. **Broken Least-Privilege Security**: The runtime API pod's Managed Identity only needs `db_datareader` and `db_datawriter` (`SELECT, INSERT, UPDATE, DELETE`). Giving the runtime web pod `ddl_admin` (`DROP TABLE`, `ALTER TABLE`) means a single SQL Injection vulnerability can drop the entire schema!
3. **Coupled Rollback Failure**: If `v2` pod crashes 30 seconds after running its startup migration, Kubernetes rolls back to `v1` pods, which immediately crash because the database schema was irreversibly mutated.

---

## 2. Building Self-Contained EF Core Migration Bundles + Automated SQL Linter

```bash
# Build a standalone, idempotent Linux binary for the migration stage in CI
dotnet ef migrations bundle   --project ./src/Infrastructure/Infrastructure.csproj   --startup-project ./src/Api/Api.csproj   --self-contained -r linux-x64   --output ./artifacts/efbundle

# Generate idempotent SQL script for automated CI static safety inspection
dotnet ef migrations script --idempotent --output ./artifacts/migration.sql
```

### Automated CI Destructive-DDL Gate (Python / Regex / SQLFluff Gate)

```python
# scripts/lint_migration_safety.py — Fails CI if destructive or un-guarded DDL is detected
import re, sys

sql = open(sys.argv[1], encoding="utf-8").read().upper()
FORBIDDEN_PATTERNS = [
    (r"DROP\s+COLUMN", "Dropping columns requires an approved Phase-5 Contract tag [ALLOW_CONTRACT]."),
    (r"DROP\s+TABLE", "Dropping tables is blocked in standard CI pipelines."),
    (r"sp_rename", "In-place column/table renames break N-1 running pods! Use Expand/Contract."),
]

for pattern, reason in FORBIDDEN_PATTERNS:
    if re.search(pattern, sql) and "[ALLOW_CONTRACT]" not in sql:
        print(f"CI SCHEMA GATE FAILED: {reason}")
        sys.exit(1)
print("Migration passed Principal Zero-Downtime safety checks.")
```
