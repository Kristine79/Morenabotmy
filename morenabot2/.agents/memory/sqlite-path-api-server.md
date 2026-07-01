---
name: SQLite path resolution in api-server
description: How to correctly resolve path to bot's SQLite DB from api-server workflow
---

When api-server runs via workflow, `process.cwd()` is `artifacts/api-server`, NOT the monorepo root.
Must detect and normalize:

```ts
function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join("artifacts", "api-server"))) {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}
```

DB path: `path.resolve(getWorkspaceRoot(), "artifacts/morena-vpn-bot/prisma/morena.db")`

**Why:** The workflow `command` runs from the artifact directory, but the monorepo root is two levels up.
**How to apply:** Any time api-server needs to access files outside its own directory (e.g. shared SQLite DB).
