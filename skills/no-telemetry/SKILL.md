---
name: no-telemetry
description: >-
  Disable and verify telemetry opt-outs for JS/TS libraries (Next.js, Prisma,
  Turborepo, Storybook, etc.). Use after scaffolding, after adding dependencies,
  or before opening a PR. Offline, no network, structured JSON + exit codes.
---

# no-telemetry

Detect installed JS/TS libraries that collect telemetry and set the correct environment variables to disable it. Verify the result for CI and agents.

## When to run

- After scaffolding a new app (`create-next-app`, `npm create`, etc.)
- After `pnpm add` / `npm install` / `yarn add` of framework or CLI tooling
- Before opening a PR, or as a CI step
- When the user asks to disable telemetry or prove it is off

## Commands (copy-paste)

```bash
# Apply opt-outs (non-interactive — always pass -y for agents)
npx no-telemetry init -y --json

# Verify (exit 1 if anything still enabled)
npx no-telemetry check --json

# Report only (always exit 0)
npx no-telemetry doctor --json
```

Optional:

```bash
npx no-telemetry init -y --target .env.local
npx no-telemetry init -y --target stdout   # KEY=VAL lines on stdout only
npx no-telemetry doctor --only installed
npx no-telemetry check --ignore netlify-cli
```

## Exit codes

| Code | Meaning                                                                                    |
| ---- | ------------------------------------------------------------------------------------------ |
| `0`  | Success (`doctor` always; `check` when policy passes; `init` applied or noop)              |
| `1`  | Policy failure — `check` found enabled telemetry; or user aborted `init`                   |
| `2`  | Tool/usage error — bad flags, no `package.json`, or non-interactive `init` without `--yes` |

Agents **must** pass `--yes` / `-y` for `init`. Non-TTY and `CI=true` sessions refuse to prompt.

## Interpreting `--json`

Top-level shape (`version: 1`):

- `summary.enabled` / `summary.disabled` / `summary.applicable`
- `libraries[]`: `id`, `status`, `failsCheck`, `env[]` with `source` (`process-env` | `env-file` | `unset`)
- `actions[]` on `init` (adds / conflicts)

Status tokens: `disabled` | `enabled` | `not_applicable` | `not_found` | `unsupported`.

`check` fails when any non-ignored library has `failsCheck: true` (status `enabled`).

## Rules

1. **Never send network requests** as part of this tool — it is offline by design.
2. **Do not invent env vars** — only write what `init` plans.
3. **Do not overwrite** conflicting values; report conflicts and let the human fix them.
4. Prefer committing opt-out vars that belong in the project (`.env` / `.env.local` per team policy). Do not commit secrets; these opt-outs are not secrets.
5. After changing dependencies, re-run `check --json`.

## Programmatic (Node)

```ts
import { scan, planInit, applyInit, failsCheck, buildReport, REGISTRY } from "no-telemetry";

const results = scan(process.cwd(), {});
if (results.some(failsCheck)) {
  const plan = planInit(process.cwd());
  applyInit(process.cwd(), plan);
}
```
