# no-telemetry

Detect telemetry in your JS/TS dependencies and disable it in one command.

[![npm version](https://img.shields.io/npm/v/no-telemetry?logo=npm)](https://www.npmjs.com/package/no-telemetry)
[![npm downloads](https://img.shields.io/npm/dm/no-telemetry?logo=npm)](https://www.npmjs.com/package/no-telemetry)
[![CI](https://github.com/apvarun/no-telemetry/actions/workflows/ci.yml/badge.svg)](https://github.com/apvarun/no-telemetry/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/node/v/no-telemetry?logo=node.js)](./package.json)

**The name applies to the CLI, too:** `no-telemetry` collects no telemetry, has zero production dependencies, and makes no runtime network requests.

![Terminal demo of no-telemetry finding dependencies and disabling their telemetry](./demo-no-telemetry.gif)

## Contents

- [Why no-telemetry?](#why-no-telemetry)
- [Quick start](#quick-start)
- [What it looks like](#what-it-looks-like)
- [Coverage](#coverage)
- [How it works and stays safe](#how-it-works-and-stays-safe)
- [CI](#ci)
- [Command reference](#command-reference)
- [Programmatic API](#programmatic-api)
- [Contributing](#contributing)
- [Development](#development)

## Why no-telemetry?

- **Keep project activity private.** Disable supported analytics at the source with each tool's documented environment variable.
- **Keep telemetry out of CI.** Apply the same opt-outs locally, in automation, and in air-gapped environments without maintaining a pile of one-off scripts.
- **Make policy auditable.** Store explicit opt-outs in a dotenv file and enforce them with a CI-friendly exit code.
- **Stop hunting through vendor docs.** Use one curated registry for vendor-specific flags and the `DO_NOT_TRACK` convention.

## Quick start

Run these commands from the directory containing your `package.json`:

```bash
npx no-telemetry init -y   # add missing opt-out variables to .env
npx no-telemetry doctor    # show telemetry status
npx no-telemetry check     # same report; exit 1 if anything is still enabled
```

Want to inspect the change first?

```bash
npx no-telemetry init --dry-run
```

Agents and CI can use structured output:

```bash
npx no-telemetry init -y --json
npx no-telemetry check --json=compact   # one-line JSON for pipes
npx no-telemetry list --json            # registry coverage; no project needed
npx no-telemetry why next --json        # env variable and docs for one tool
```

## What it looks like

After `init`, `doctor` prints a per-tool status table:

```text
Library     Status      Variable
────────────────────────────────────────────
Next.js     ✓ disabled  NEXT_TELEMETRY_DISABLED=1
Turborepo   ✓ disabled  TURBO_TELEMETRY_DISABLED=1
Prisma      ✓ disabled  CHECKPOINT_DISABLE=1

3 of 3 applicable libraries have telemetry disabled.
```

`doctor` always exits `0`. Use `check` when enabled telemetry should fail a build.

## Coverage

The bundled registry currently knows about **43 tools**: 34 documented environment-variable opt-outs, 2 opt-in checks, and 7 config-only tools that are detected and reported without being changed.

That includes Next.js, Prisma, Vercel CLI, Turborepo, Storybook, Expo, Wrangler, Supabase CLI, GitHub CLI, Claude Code, and more.

```bash
npx no-telemetry list        # show every registry entry
npx no-telemetry why turbo   # show Turbo's variables, notes, and official docs
```

Is your tool missing? [Adding a registry entry](#contributing) is a small, data-only contribution.

Unlike manually grepping documentation or maintaining a broad list such as [toptout](https://github.com/beatcracker/toptout), `no-telemetry` detects the tools in the current project, applies their documented dotenv opt-outs, and can enforce the result in CI.

## How it works and stays safe

1. Reads the `dependencies` and `devDependencies` from the current directory's `package.json`.
2. Matches those direct dependencies against the registry bundled with the package.
3. Adds the documented opt-out variables to `.env` or another target you choose.
4. Resolves the effective values from the process environment, `.env.local`, and `.env`, then reports whether telemetry is disabled.

The CLI is deliberately narrow:

- It makes **no runtime network requests** and never downloads a registry. (`npx` may download the package itself when it is not already cached.)
- It never overwrites a non-empty value. Conflicts are reported for you to resolve.
- It fills empty `KEY=` placeholders in place and keeps new variables in one marker-delimited block.
- It writes only dotenv-style assignments and its audit marker comments to the selected target; the default is `.env`.
- It does not edit shell profiles, tool config files, lockfiles, or `package.json`.
- It always includes `DO_NOT_TRACK=1` alongside any tool-specific variables.
- Re-running `init` is idempotent.

### Scope

`no-telemetry` scans one `package.json` in the current directory. It does not currently scan workspaces or transitive dependencies.

The registry focuses on environment-variable opt-outs. Tools that require config files or saved CLI state are reported as `unsupported` and left untouched.

`doctor` and `check` resolve values in this precedence order: process environment, `.env.local`, then `.env`.

## CI

Pin the version so your policy does not change unexpectedly:

```yaml
- name: Telemetry opt-out check
  run: npx --yes no-telemetry@0.2.0 check --json=compact
```

To apply opt-outs after scaffolding and then verify them:

```yaml
- run: npx --yes no-telemetry@0.2.0 init -y
- run: npx --yes no-telemetry@0.2.0 check --json=compact
```

The first `--yes` accepts the `npx` install. The `-y` after `init` accepts the file write.

## Command reference

### `init`

Reads `package.json`, matches direct dependencies against the built-in registry, and adds missing opt-out variables to the write target. The default target is `.env`.

| Flag              | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `--yes` / `-y`    | Skip confirmation (required when non-TTY or `CI=true`)               |
| `--dry-run`       | Show what would be written; do not write                             |
| `--json`          | Machine-readable report (`version: 1`)                               |
| `--target <path>` | Any env-file path, or `stdout` (default: `.env`)                     |
| `--example`       | Shorthand for `--target .env.example` (commit-safe opt-out template) |

`init` does not accept `--only`, `--ignore`, or `--all`; those flags belong to `doctor` and `check`.

- Creates the target file if needed (except for `stdout`)
- Skips variables already set correctly
- Fills empty `KEY=` placeholders in place
- Warns instead of overwriting a different value
- Always includes `DO_NOT_TRACK=1`
- Keeps generated variables in one marker-delimited section with a versioned creation header
- In `stdout` mode, writes pure `KEY=VALUE` lines to stdout and diagnostics to stderr
- With `--target stdout --json`, keeps dotenv lines on stdout and sends the JSON report to stderr
- Treats `--example` / `.env.example` like any other dotenv target; generated values contain no secrets

### `doctor`

Prints a per-library table and always exits `0`. Installed libraries determine the summary. The human-readable table hides `not found` rows unless you pass `--all`.

| Flag               | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| `--json`           | Full machine-readable report                     |
| `--only <filter>`  | `installed` or `failing`                         |
| `--ignore <value>` | Omit by id, display name, or package; repeatable |
| `--all`            | Include not-found rows in the human table        |

`doctor` and `check` do not accept `--yes`, `--dry-run`, or `--target`.

`--only` filters `libraries[]` in JSON; `summary` retains the full post-`--ignore` policy counts.

### `check`

Produces the same output as `doctor`, but exits `1` if any installed, applicable library still has telemetry enabled after `--ignore`.

```bash
npx no-telemetry check
```

### `list`

Dumps the full registry without reading `package.json`. Use it to discover coverage or feed registry data to another tool.

```bash
npx no-telemetry list
npx no-telemetry list --json
```

### `why <id>`

Explains one registry entry: environment variables, official docs, notes, and alternate satisfaction signals.

```bash
npx no-telemetry why next
npx no-telemetry why turbo --json
```

### Shared flags

| Flag               | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `--json`           | Pretty-printed JSON report (`version: 1`)                              |
| `--json=compact`   | One-line JSON for pipes                                                |
| `--quiet` / `-q`   | Suppress human diagnostics; with `--json`, also selects compact output |
| `--version` / `-V` | Print version                                                          |
| `--help` / `-h`    | Show help                                                              |

#### Color

| Environment variable | Effect                                              |
| -------------------- | --------------------------------------------------- |
| `NO_COLOR`           | Disable ANSI colors when set to any non-empty value |
| `FORCE_COLOR`        | Force colors outside a TTY (`0` disables them)      |

### Exit codes

| Code | Meaning                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| `0`  | Success; `doctor` always, `check` when policy passes, or `init` completes             |
| `1`  | Policy failure; `check` found enabled telemetry, or interactive `init` was aborted    |
| `2`  | Tool or usage error; bad flags, missing `package.json`, or unconfirmed non-TTY `init` |

### Registry details

Library definitions live in [`src/registry.ts`](./src/registry.ts), the single source of truth. Each has a stable `id` such as `next`, `prisma`, or `vercel` for `--ignore`, `why`, and JSON output. Every environment variable is curated against official documentation.

Some tools honor a proprietary opt-out or `DO_NOT_TRACK` (for example, Turbo, Railway, and Supabase). Alternate signals use OR semantics by default. Entries with `alternatePolicy: "fallback"` use alternates only when the primary key is unset; this models tools such as GitHub CLI, where `GH_TELEMETRY` takes precedence. `init` still writes the primary tool-specific key plus `DO_NOT_TRACK=1`.

Registry entries are a discriminated union:

| `kind`        | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| `opt-out`     | Telemetry is on by default; set `env` to disable it               |
| `opt-in`      | Telemetry is off by default; `enableWhen` values mean it is on    |
| `unsupported` | No environment-variable opt-out; config or CLI action is required |

`opt-out` bindings may include `accepts` for multiple accepted values or non-empty semantics. Entries can also include `alsoSatisfiedBy` and `alternatePolicy` for additional signals.

## Programmatic API

The stable API is ESM-only and supports Node.js 18+:

```ts
import { scan, planInit, applyInit, failsCheck, buildReport, REGISTRY } from "no-telemetry";

const cwd = process.cwd();
const results = scan(cwd);
const failing = results.filter(failsCheck);
const report = buildReport(cwd, results);
```

| Export                             | Role                                    |
| ---------------------------------- | --------------------------------------- |
| `scan` / `evaluate`                | Detect dependencies and evaluate status |
| `planInit` / `applyInit`           | Plan and apply idempotent dotenv writes |
| `failsCheck`                       | Apply the check policy                  |
| `buildReport` / `buildErrorReport` | Build the JSON DTO (`version: 1`)       |
| `REGISTRY`                         | Read the curated library data           |
| `filterResults`                    | Apply presentation filters              |

`LibraryResult.status` uses machine-stable tokens: `disabled`, `enabled`, `not_applicable`, `not_found`, and `unsupported`. The CLI maps these to human labels such as `✓ disabled` and `- n/a`.

Target-specific plans must be applied to the same target:

```ts
const target = ".env.local";
const plan = planInit(cwd, { target });
applyInit(cwd, plan, { target });

scan(cwd, process.env, { envFiles: [".env", ".env.local"] });
```

## Contributing

The easiest way to expand coverage is to add a typed entry to [`src/registry.ts`](./src/registry.ts):

1. Find the tool's official telemetry documentation.
2. Add its package match, stable id, opt-out variable, docs URL, and any notes.
3. Run the tests; registry entries receive automatic golden-test coverage.

Special matching or precedence rules should include a focused test. Config-only tools are welcome as `unsupported` entries so `doctor` can still surface them without changing user files.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full registry schema, development workflow, and pull request checklist.

## Development

```bash
pnpm install
pnpm run check
pnpm test
pnpm run build
```

The development toolchain runs on Node.js 22. The packed CLI and programmatic API are smoke-tested on Node.js 18, 20, and 22:

```bash
mkdir -p artifacts
pnpm pack --pack-destination artifacts
TARBALL=$(find artifacts -name '*.tgz' -type f -print -quit)
pnpm run test:package "$TARBALL" --tsc node_modules/.bin/tsc
```

Zero production dependencies. Runtime support: Node.js 18+.

## Project links

- [Changelog](./CHANGELOG.md)
- [Agent skill](./skills/no-telemetry/SKILL.md)

## License

[MIT](./LICENSE)
