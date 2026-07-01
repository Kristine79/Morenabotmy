---
name: better-sqlite3 install in pnpm monorepo
description: Steps to correctly install better-sqlite3 which requires native build scripts
---

`better-sqlite3` requires native compilation and will be silently skipped unless allowed.

Steps:
1. `pnpm --filter @workspace/<pkg> add better-sqlite3`
2. Add `better-sqlite3` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`
3. Re-run `pnpm --filter @workspace/<pkg> install` — this time the native build runs

**Why:** pnpm blocks build scripts by default for security. The warning says "Ignored build scripts: better-sqlite3" if step 2 is skipped.
**How to apply:** Any new package in this monorepo that uses better-sqlite3 needs this two-step approach.
