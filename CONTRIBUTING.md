# Contributing to no-telemetry

Thanks for helping keep JS/TS projects free of surprise telemetry.

## Principles

1. **No network by default** - the tool must never phone home.
2. **Zero production dependencies** unless there is a crushing reason.
3. **Non-destructive** - never overwrite user env values; never delete config silently.
4. **Idempotent `init`** - re-running is safe and boring.
5. **Registry is data** - prefer a PR that adds a typed entry over clever detection.

## Development

```bash
pnpm install   # or: vp install
pnpm test      # vp test
pnpm run check # lint + typecheck
pnpm run build # vp pack
```

Node 18+ required.

## Adding a library to the registry

1. Confirm an **official, documented** env-var opt-out (link it in the PR description and set **required** `docs` on the entry).
2. Prefer tools that show up in **project `package.json`** (direct deps). Machine-wide-only tools (browsers, OS) belong elsewhere (e.g. toptout), not here.
3. Edit `src/registry.ts`:
   - Stable **`id`** (kebab-case, usually the npm package name).
   - `kind`: `opt-out` | `opt-in` | `unsupported`.
   - `packages`: detection keys; trailing `/*` for scopes (e.g. `@storybook/*`).
   - For `opt-out` / `opt-in`: `env: { key, value }` (primary; what `init` writes).
   - For `opt-out` only: optional `alsoSatisfiedBy: EnvOptOut[]` when the tool also honors another signal (e.g. `DO_NOT_TRACK=1`).
   - Set `alternatePolicy: "fallback"` when alternates apply only if the primary key is unset; omit it for the default OR behavior.
   - For `opt-in`: `enableWhen` values that mean telemetry is **on**.
   - **`docs`** URL (required) and optional `notes` for quirks.
4. Golden tests iterate the full `REGISTRY` - new entries are covered automatically. Add a focused test only for special matching rules.
5. Update `README.md` only if the public command surface changes (registry details live in source).

### Registry schema & id stability

| Field             | Notes                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`              | **Semver-stable.** Never delete or repurpose an id; deprecate with `notes` + keep the row if detection still matters. |
| `kind`            | Discriminated union: `opt-out` \| `opt-in` \| `unsupported`.                                                          |
| `packages`        | Direct dep names / scope prefixes used for detection.                                                                 |
| `env`             | Primary opt-out (or recommended disable for opt-in).                                                                  |
| `alsoSatisfiedBy` | Optional alternate signals (opt-out only). Not written by `init`.                                                     |
| `alternatePolicy` | `"or"` by default; `"fallback"` consults alternates only when the primary key is unset.                               |
| `docs`            | Official documentation URL - required for new entries.                                                                |
| `notes`           | Human/agent hints (quirks, CLI alternatives).                                                                         |

Agents discover coverage via `no-telemetry list` and `no-telemetry why <id>` without scanning a project.

### Unsupported (config-only) tools

If there is no env-var opt-out, add `kind: "unsupported"` with a short `notes` string and a `docs` link if available. Do not invent env vars.

## Pull requests

- Keep diffs focused; no drive-by refactors.
- Ensure `pnpm test` and `pnpm run check` pass.
- Do not commit secrets. Opt-out vars in fixtures are fine.

## Stable API

Public (semver) surface from `import "no-telemetry"`:

| Export                                        | Notes                                     |
| --------------------------------------------- | ----------------------------------------- |
| `scan`, `planInit`, `applyInit`, `failsCheck` | Core flows                                |
| `REGISTRY`, `DO_NOT_TRACK`                    | Data                                      |
| `buildReport` / `buildErrorReport`            | JSON DTO (`version: 1`; optional `error`) |
| `LibraryResult`, `Status`, `ReportV1`, …      | Types                                     |

Command-scoped CLI flags: `init` owns `--yes` / `--dry-run` / `--target` / `--example`; `doctor`/`check` own `--only` / `--ignore` / `--all`; `list` / `why` take only shared flags. Cross-use is a usage error (exit 2).

CLI human table formatting is **not** a stable contract - use `--json` / `--json=compact` and exit codes.

Machine status tokens: `disabled` | `enabled` | `not_applicable` | `not_found` | `unsupported`.

## Release checklist (maintainers)

- [ ] `CHANGELOG.md` updated
- [ ] `pnpm test` + `pnpm run check` + `pnpm run build`
- [ ] `npm pack --dry-run` includes `dist/` and `skills/`
- [ ] Version bump (`bumpp` or manual)
