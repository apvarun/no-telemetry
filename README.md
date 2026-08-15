# no-telemetry

Detect which JavaScript/TypeScript libraries in your project have telemetry, and set the correct environment variables to disable it - in one command.

```bash
npx no-telemetry init -y   # write opt-out vars to .env
npx no-telemetry doctor    # report status
npx no-telemetry check     # same as doctor, exit 1 if anything is still enabled
```

Agents and CI should prefer structured output:

```bash
npx no-telemetry init -y --json
npx no-telemetry check --json=compact   # one-line JSON for pipes
npx no-telemetry list --json            # registry coverage (no project needed)
npx no-telemetry why next --json        # env + docs for one library
```

## CI (GitHub Actions)

Add a policy gate after install. No generator required:

```yaml
- name: Telemetry opt-out check
  run: npx no-telemetry check
```

With structured output (useful for artifacts / debugging):

```yaml
- name: Telemetry opt-out check
  run: npx no-telemetry check --json=compact
```

After scaffolding a new app in CI, apply then verify:

```yaml
- run: npx no-telemetry init -y
- run: npx no-telemetry check
```

## Commands

### `init`

Reads `package.json` (`dependencies` + `devDependencies`), matches them against the built-in registry, and appends missing opt-out vars to the write target (default `.env`).

| Flag              | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `--yes` / `-y`    | Skip confirmation (required when non-TTY or `CI=true`)               |
| `--dry-run`       | Show what would be written, don't write                              |
| `--json`          | Machine-readable report (`version: 1`) on stdout                     |
| `--target <path>` | `.env` (default), `.env.local`, `.env.example`, or `stdout`          |
| `--example`       | Shorthand for `--target .env.example` (commit-safe opt-out template) |

`init` does **not** accept `--only`, `--ignore`, or `--all` (those are doctor/check only).

- Creates the target file if needed (not for `stdout`)
- Skips vars already set correctly
- Never overwrites a different value (warns instead)
- Always includes `DO_NOT_TRACK=1`
- Writes a versioned comment header (`# no-telemetry 0.1.0 - <ISO timestamp>`)
- `stdout` mode: pure `KEY=VAL` lines on stdout; diagnostics on stderr
- `--example` / `.env.example`: same keys as `.env`, safe to commit (no secrets)

### `doctor`

Prints a per-library table. Installed libraries matter for the summary. Human table hides `not found` by default (`--all` to show). Always exits 0.

| Flag                           | Meaning                                     |
| ------------------------------ | ------------------------------------------- |
| `--json`                       | Full machine-readable report                |
| `--only installed` / `failing` | Filter display rows                         |
| `--ignore <id>`                | Omit library (by stable id or package name) |
| `--all`                        | Include not-found rows in human table       |

`doctor` / `check` do **not** accept `--yes`, `--dry-run`, or `--target`.

### `check`

Same output as `doctor`, but exits **1** if any installed, applicable library still has telemetry enabled (after `--ignore`). Use in CI:

```bash
npx no-telemetry check
```

### `list`

Dumps the full registry without reading `package.json`. Useful for agents and docs to discover coverage.

```bash
npx no-telemetry list
npx no-telemetry list --json
```

### `why <id>`

Explain one registry entry: env vars, docs URL, notes, and alternate satisfaction signals.

```bash
npx no-telemetry why next
npx no-telemetry why turbo --json
```

## Shared flags

| Flag               | Meaning                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `--json`           | Pretty-printed JSON report (`version: 1`)                                |
| `--json=compact`   | One-line JSON (agent pipes)                                              |
| `--quiet` / `-q`   | Suppress human diagnostics on stderr; with `--json` also selects compact |
| `--version` / `-V` | Print version                                                            |
| `--help` / `-h`    | Help                                                                     |

### Color

| Env           | Effect                                               |
| ------------- | ---------------------------------------------------- |
| `NO_COLOR`    | Disable ANSI colors when set to any non-empty value  |
| `FORCE_COLOR` | Force colors even when stdout is not a TTY (`0` off) |

## Exit codes

| Code | Meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| `0`  | Success - `doctor` always; `check` when policy passes; `init` applied or nothing to do       |
| `1`  | Policy failure - `check` found enabled telemetry; interactive `init` aborted                 |
| `2`  | Tool/usage error - bad flags, missing `package.json`, non-interactive `init` without `--yes` |

## Registry

Library opt-outs live in [`src/registry.ts`](./src/registry.ts) - the single source of truth (not duplicated here). Each entry has a stable `id` (e.g. `next`, `prisma`, `vercel`) for `--ignore`, `why`, and JSON output.

Coverage focuses on **popular JS/TS project deps and npm CLIs** (frameworks, monorepo tools, deploy CLIs, AI CLIs, data platforms). Config-only tools (Netlify, Yarn, Ionic, …) are listed as `unsupported` so `doctor` still surfaces them. Research lists like [toptout](https://github.com/beatcracker/toptout) are useful seeds; every var is curated and re-verified - we do not bulk-import stale catalogs.

`doctor` / `check` resolve env from **process env** (wins), then **`.env`**, then **`.env.local`** (local overrides `.env`).

Some tools honor a proprietary opt-out **or** `DO_NOT_TRACK` (e.g. Turbo, Railway, Supabase). Alternate signals use OR semantics by default. Entries with `alternatePolicy: "fallback"` use alternates only when the primary key is unset; this models tools such as GitHub CLI where `GH_TELEMETRY` takes precedence. `init` still writes the primary library-specific key plus `DO_NOT_TRACK=1`.

## Programmatic API

**Stable surface** (semver):

```ts
import { scan, planInit, applyInit, failsCheck, buildReport, REGISTRY } from "no-telemetry";

const results = scan(process.cwd());
const failing = results.filter(failsCheck);
const report = buildReport(process.cwd(), results);
```

| Export                             | Role                                      |
| ---------------------------------- | ----------------------------------------- |
| `scan` / `evaluate`                | Detect + status                           |
| `planInit` / `applyInit`           | Idempotent `.env` (or target) writes      |
| `failsCheck`                       | Policy helper for `check`                 |
| `buildReport` / `buildErrorReport` | JSON DTO (`version: 1`; optional `error`) |
| `REGISTRY`                         | Curated library data                      |
| `filterResults`                    | Presentation filters                      |

`LibraryResult.status` uses machine-stable tokens: `disabled`, `enabled`, `not_applicable`, `not_found`, `unsupported`. The CLI maps these to human labels (`✓ disabled`, `- n/a`, …).

Optional options (defaults shown):

```ts
planInit(cwd, { target: ".env.local" });
applyInit(cwd, plan, { target: "stdout" }); // returns { lines } without writing
applyInit(cwd, plan, { target: ".env.example" });
scan(cwd, processEnv, { envFiles: [".env", ".env.local"] });
```

Registry entries are a discriminated union on `kind`:

| `kind`        | Meaning                                       |
| ------------- | --------------------------------------------- |
| `opt-out`     | Telemetry on by default; set `env` to disable |
| `opt-in`      | Off by default; `enableWhen` values mean ON   |
| `unsupported` | No env-var opt-out (config/CLI only)          |

`opt-out` may include `alsoSatisfiedBy` for extra env bindings and `alternatePolicy: "fallback"` when those bindings apply only while the primary key is unset. The default policy is `"or"`.

## Agent skill

Ship-ready instructions for coding agents: [`skills/no-telemetry/SKILL.md`](./skills/no-telemetry/SKILL.md).

## Development

```bash
pnpm install
pnpm test
pnpm run build
```

Zero production dependencies. Node 18+.

## License

MIT

## Package name

`no-telemetry` was available on the npm registry at last check (no prior package). Publish with `npm publish` after CI is green.
