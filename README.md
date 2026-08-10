# no-telemetry

Detect which JavaScript/TypeScript libraries in your project have telemetry, and set the correct environment variables to disable it — in one command.

```bash
npx no-telemetry init     # write opt-out vars to .env
npx no-telemetry doctor   # report status
npx no-telemetry check    # same as doctor, exit 1 if anything is still enabled
```

## Commands

### `init`

Reads `package.json` (`dependencies` + `devDependencies`), matches them against the built-in registry, and appends missing opt-out vars to `.env`.

| Flag           | Meaning                                 |
| -------------- | --------------------------------------- |
| `--yes` / `-y` | Skip confirmation                       |
| `--dry-run`    | Show what would be written, don't write |

- Creates `.env` if needed
- Skips vars already set correctly
- Never overwrites a different value (warns instead)
- Always includes `DO_NOT_TRACK=1`

### `doctor`

Prints a per-library table (installed only matter for the summary). Always exits 0.

### `check`

Same output as `doctor`, but exits **1** if any installed, applicable library still has telemetry enabled. Use in CI:

```bash
npx no-telemetry check
```

## Registry

Library opt-outs live in [`src/registry.ts`](./src/registry.ts) — the single source of truth (not duplicated here).

## Out of scope (v0.1)

- Shell profile writing (`.zshrc` / `.bashrc`)
- Monorepo / multi-`package.json` scanning
- Transitive (`node_modules`) detection — direct deps only
- Config-file opt-outs (Yarn, Storybook `main.ts`, etc.)
- Network calls of any kind (including update checks)

## Programmatic API

```ts
import { scan, planInit, failsCheck, REGISTRY } from "no-telemetry";

const results = scan(process.cwd());
const failing = results.filter(failsCheck);
```

`LibraryResult.status` uses machine-stable tokens: `disabled`, `enabled`, `not_applicable`, `not_found`, `unsupported`. The CLI maps these to human labels (`✓ disabled`, `— n/a`, …).

Registry entries are a discriminated union on `kind`:

| `kind`        | Meaning                                       |
| ------------- | --------------------------------------------- |
| `opt-out`     | Telemetry on by default; set `env` to disable |
| `opt-in`      | Off by default; `enableWhen` values mean ON   |
| `unsupported` | No env opt-out in v0.1                        |

## Development

```bash
vp install
vp test
vp pack
```

Zero production dependencies. Node 18+.

## License

MIT
