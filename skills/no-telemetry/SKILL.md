---
name: no-telemetry
description: >-
  Disable and verify telemetry opt-outs for JS/TS libraries (Next.js, Prisma,
  Turborepo, Storybook, etc.). Use after scaffolding, after adding dependencies,
  or before opening a PR. Launch commands with cross-ecosystem opt-outs using run.
  Offline registry, structured JSON reports and exit codes.
---

# no-telemetry

Detect installed JS/TS libraries that collect telemetry and set the correct environment variables to disable it. Verify the result for CI and agents.

## When to run

- After scaffolding a new app (`create-next-app`, `npm create`, etc.)
- After `pnpm add` / `npm install` / `yarn add` of framework or CLI tooling
- Before opening a PR, or as a CI step
- When the user asks to disable telemetry or prove it is off
- When you need to know which libraries are covered (`list` / `why`)

## Commands (copy-paste)

```bash
# Apply opt-outs (non-interactive - always pass -y for agents)
npx no-telemetry init -y --json=compact

# Verify (exit 1 if anything still enabled)
npx no-telemetry check --json=compact

# Report only (always exit 0)
npx no-telemetry doctor --json=compact

# Execute with opt-outs (no package.json required; child output stays unchanged)
npx no-telemetry run -- npm run build
npx no-telemetry run --include dotnet -- dotnet build

# Discover coverage (no package.json required)
npx no-telemetry list --json=compact
npx no-telemetry why next --json=compact
```

Optional:

```bash
npx no-telemetry init -y --target .env.local
npx no-telemetry init -y --example          # commit-safe .env.example
npx no-telemetry init -y --target stdout    # KEY=VAL lines on stdout only
npx no-telemetry doctor --only installed
npx no-telemetry check --ignore netlify-cli
npx no-telemetry check --json --quiet       # compact + no stderr noise
```

## Exit codes

| Code | Meaning                                                                                    |
| ---- | ------------------------------------------------------------------------------------------ |
| `0`  | Success (`doctor` always; `check` when policy passes; `init` applied or noop)              |
| `1`  | Policy failure - `check` found enabled telemetry; or user aborted `init`                   |
| `2`  | Tool/usage error - bad flags, no `package.json`, or non-interactive `init` without `--yes` |

Agents **must** pass `--yes` / `-y` for `init`. Non-TTY and `CI=true` sessions refuse to prompt.

Prefer `--json=compact` (or `--json --quiet`) for agent pipes - one line, no pretty-print padding.

## Interpreting `--json`

Top-level shape (`version: 1`) for doctor/check/init:

- `summary.enabled` / `summary.disabled` / `summary.applicable`
- `libraries[]`: `id`, `status`, `failsCheck`, `env[]` with `source` (`process-env` | `env-file` | `unset`)
- `actions[]` on `init` (adds / placeholder fills / conflicts)

`--only` filters `libraries[]`; `summary` always describes the full post-`--ignore` policy set.

`list` returns `{ version: 1, libraries: [...] }` (full registry).
`why` returns a single-entry object with `id`, `env`, `docs`, `notes`, …

Status tokens: `disabled` | `enabled` | `not_applicable` | `not_found` | `unsupported`.

`check` fails when any non-ignored library has `failsCheck: true` (status `enabled`).

Optional `file` and `shadowed` fields show assignment sources. Precedence is process environment, `.env.local`, `.env`, including empty values. Fix the winning assignment. `init` reports conflicts and overrides without replacing non-empty values.

`run` requires `--` and passes child arguments unchanged. It injects all verified opt-outs, including opt-in disable values, plus DNT. Repeat exact-ID `--include` / `--ignore`; exclusion wins and DNT remains. It loads no dotenv files and changes neither files nor parent environment.

`--quiet` suppresses wrapper diagnostics; `--json` is rejected. It forwards SIGINT/SIGTERM and propagates child exit codes or POSIX signals. Usage and launch errors return `2`. Use `sh -c` for shell syntax or `cmd.exe /d /s /c` for Windows batch commands. It does not block child networking.

Scans detect direct npm dependencies only. Other tools are available through `run`, `list`, and `why`. Check `ecosystem`, `verifiedAt`, and notes for scope and version limits. Unsupported entries require manual action.

Bindings may report multiple `accepts` values, `"non-empty"`, or `"set"` (including empty). Alternate signals use OR semantics by default. If a `why` / `list` row reports `alternatePolicy: "fallback"`, its `alsoSatisfiedBy` values apply only while the primary env key is unset.

## Rules

1. **Never send network requests** as part of this tool - it is offline by design.
2. **Do not invent env vars** - only write what `init` plans.
3. **Do not overwrite** conflicting values; report conflicts and let the human fix them.
4. Prefer committing opt-out vars that belong in the project (`.env` / `.env.local` / `.env.example` per team policy). Do not commit secrets; these opt-outs are not secrets.
5. After changing dependencies, re-run `check --json=compact`.
6. Use `list` / `why <id>` before guessing coverage.

## Programmatic (Node)

```ts
import { scan, planInit, applyInit, failsCheck, buildReport, REGISTRY } from "no-telemetry";

const results = scan(process.cwd());
if (results.some(failsCheck)) {
  const plan = planInit(process.cwd());
  applyInit(process.cwd(), plan);
}
```

`buildRunEnv` returns `{ env, assignments }` without launching a process.
