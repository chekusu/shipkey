# Monorepo Support Design

## Background

The original shipkey design assumed a single-app repository:

- `scan` recursively finds all `.env` files and **merges** all keys into a single flat `shipkey.json` at the project root
- `push` uploads all keys under one project name
- `pull` writes a single `.envrc` / `.dev.vars` to the root directory

This breaks down in monorepo scenarios where different subdirectories have separate `.env` files with different secrets (e.g., `apps/web/.env`, `apps/api/.env`, `terraform/.env`).

---

## Problem Statement

### 1. Key collision

`apps/web/.env` and `apps/api/.env` may both contain `DATABASE_URL`. After `collectEnvKeys` flattens everything, only one value survives. There is no way to distinguish which key belongs to which subproject.

### 2. Pull restores to wrong location

`pull` writes a single `.envrc` to `projectRoot`. There is no mechanism to restore `apps/web/.env` and `apps/api/.env` as separate files. All keys end up in the root, useless for subprojects that run independently (e.g., `cd terraform && terraform apply`).

### 3. direnv workaround is fragile

The only working pattern today is:
- Root `.envrc` contains all secrets
- Each subdirectory manually adds `source_up` to inherit from root

This requires manual setup per subdirectory, doesn't work for non-direnv tools (Terraform, Docker Compose), and mixes secrets from different services in one file.

---

## Options Considered

### Option A: Encode subPath in field name

Extend the field name format from `{project}-{env}.{FIELD}` to `{project}-{env}.{subPath}:{FIELD}`:

```
myapp-prod.DATABASE_URL              # root (unchanged, backward compat)
myapp-prod.apps/web:DATABASE_URL     # web subproject
myapp-prod.apps/api:DATABASE_URL     # api subproject
```

**Pros:**
- Minimal change to `SecretRef` structure
- Backward compatible: root-level keys unchanged
- Single vault item per provider

**Cons:**
- Field names become complex and hard to read in the vault UI
- `/` in field names may cause issues in some vault implementations
- Pull must parse subPath from field name and reconstruct directory structure
- Rename `apps/web` → `apps/frontend`: all stored field names break. Must manually migrate secrets in the vault.
- Directory structure is baked into the vault — the two are tightly coupled.

**Verdict: Rejected.** The rename fragility is a fundamental problem, not an edge case.

---

### Option B: Subdirectory as independent project (auto-derived name)

Each subdirectory with a `.env` becomes a separate project in the vault:

```
apps/web  → project: myapp-web
apps/api  → project: myapp-api
```

`shipkey.json` gets a top-level `subprojects` map:

```json
{
  "project": "myapp",
  "subprojects": {
    "apps/web": { "project": "myapp-web", "providers": { ... } },
    "apps/api": { "project": "myapp-api", "providers": { ... } }
  }
}
```

**Pros:**
- Clean vault structure, each subproject fully isolated
- Pull can restore to correct subdirectory

**Cons:**
- Rename `apps/web` → `apps/frontend`: the key in `subprojects` changes, but the vault still uses `myapp-web`. Config and vault go out of sync.
- Single root `shipkey.json` becomes a monolithic config that all subprojects depend on. Removing a subproject requires editing the root file.
- Subprojects cannot be managed independently without knowing the root config location.

**Verdict: Rejected.** Rename still causes breakage. Monolithic config is an anti-pattern.

---

### Option C: Change only pull behavior, preserve existing storage

Keep current scan/push unchanged. Add `sourcePaths` metadata to `shipkey.json` recording which key came from which file:

```json
{
  "providers": {
    "Supabase": {
      "fields": ["DATABASE_URL"],
      "sourcePaths": { "DATABASE_URL": "apps/api/.env" }
    }
  }
}
```

Pull uses `sourcePaths` to write keys to their original locations.

**Pros:**
- No change to vault storage format
- Pull becomes smarter without touching push

**Cons:**
- `sourcePaths` is origin metadata, not necessarily the restore target. If someone moves the file, it breaks.
- Key collisions across subprojects (same key name in different dirs) are still unresolved at the storage layer.
- `shipkey.json` grows with metadata that's only meaningful at restore time.

**Verdict: Rejected.** Does not solve the key collision problem.

---

### Option D: Per-directory shipkey.json with recursive walk (chosen)

**Core principle: one directory + one `.env` = one `shipkey.json`.**

Each directory that contains `.env` files manages itself independently with its own `shipkey.json`. Commands recursively discover `shipkey.json` files and process each one.

```
myrepo/
├── .env
├── shipkey.json          ← project: "myrepo"
├── apps/
│   ├── web/
│   │   ├── .env
│   │   └── shipkey.json  ← project: "myrepo-apps-web"
│   └── api/
│       ├── .env
│       └── shipkey.json  ← project: "myrepo-apps-api"
└── terraform/
    ├── .env
    └── shipkey.json      ← project: "myrepo-terraform"
```

**Command behavior:**

- `scan`: recursively find all directories containing `.env` files; for each, generate or update that directory's own `shipkey.json` scanning only that directory's files.
- `push`: recursively find all `shipkey.json` files; push each independently.
- `pull`: recursively find all `shipkey.json` files; pull each into the directory where that `shipkey.json` lives.

**Pros:**
- `shipkey.json` travels with the directory — rename `apps/web` to `apps/frontend` and the config file moves with it. The `project` field inside does not change, so vault storage is unaffected.
- Each subproject is fully self-contained and can be managed in isolation (`cd apps/web && shipkey pull`).
- No cross-contamination: `apps/web` and `apps/api` each only see their own keys.
- `pull` naturally restores to the correct directory, no path reconstruction needed.
- Backward compatible for single-app repos: behavior is identical when there is only one `.env` at the root.

**Cons:**
- Multiple `shipkey.json` files to commit and maintain.
- First-time scan creates several files at once; may feel surprising.
- Project name derivation requires git-root awareness to avoid generic names like `web`.

**Verdict: Chosen.**

---

## Key Design Decisions

### Project name derivation

Use the git repository root as an anchor to construct stable, unique names:

```
git rev-parse --show-toplevel → /workspace/myrepo

Directory          Relative path    Project name
/workspace/myrepo  .               myrepo
/workspace/myrepo/apps/web  apps/web  myrepo-apps-web
/workspace/myrepo/terraform terraform  myrepo-terraform
```

Priority order in `detectProjectName(dir)`:
1. Existing `shipkey.json` in that directory → use its `project` value unchanged
2. `package.json` `name` field in that directory
3. Git root + relative path (dashes for separators)
4. Fallback: `basename(dir)`

This means once a `shipkey.json` is created, the project name is frozen. Directory renames do not affect it.

### Scan scope per directory

When generating `shipkey.json` for a given directory, scan **only that directory's own `.env` files**, not its subdirectories. Subdirectories are handled by their own `shipkey.json`. This gives clean isolation.

### Recursive walk at command level

The recursive directory traversal moves from the scanner into the commands. Commands walk the tree, collect directories of interest (`shipkey.json` for push/pull, `.env` presence for scan), and dispatch per-directory operations.

Skip dirs remain the same: `node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `.cache`.

### Backward compatibility

A single-app repository with one root `.env` produces exactly one `shipkey.json` at the root. Behavior is identical to the current implementation. No migration needed.

---

## Implementation Plan

| File | Change |
|------|--------|
| `scanner/index.ts` | Add `scanDir(dir)` that scans only immediate `.env` files (no recursion); keep `scan()` for internal use |
| `scanner/project.ts` | `scanProject` operates on a single directory; add `walkAndScan(root)` that returns `Array<{ dir, result }>` |
| `scanner/parsers/workflow.ts` | `detectProjectName` gains git-root awareness |
| `commands/scan.ts` | Use `walkAndScan`; write `shipkey.json` per discovered directory |
| `commands/push.ts` | Walk from root, find all `shipkey.json`, push each |
| `commands/pull.ts` | Walk from root, find all `shipkey.json`, pull each into its directory |
