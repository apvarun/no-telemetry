# Contributing to no-telemetry

Thanks for helping keep JS/TS projects free of surprise telemetry.

## Principles

1. **No network by default** — the tool must never phone home.
2. **Zero production dependencies** unless there is a crushing reason.
3. **Non-destructive** — never overwrite user env values; never delete config silently.
4. **Idempotent `init`** — re-running is safe and boring.
5. **Registry is data** — prefer a PR that adds a typed entry over clever detection.

## Development

```bash
pnpm install   # or: vp install
pnpm test      # vp test
pnpm run check # lint + typecheck
pnpm run build # vp pack
```

Node 18+ required.

## Adding a library to the registry

1. Confirm an **official, documented** env-var opt-out (link it in the PR description and set optional `docs` on the entry).
2. Prefer tools that show up in **project `package.json`** (direct deps). Machine-wide-only tools (browsers, OS) belong elsewhere (e.g. toptout), not here.
3. Edit `src/registry.ts`:
   - Stable **`id`** (kebab-case, usually the npm package name).
   - `kind`: `opt-out` | `opt-in` | `unsupported`.
   - `packages`: detection keys; trailing `/*` for scopes (e.g. `@storybook/*`).
   - For `opt-out` / `opt-in`: `env: { key, value }`.
   - For `opt-in`: `enableWhen` values that mean telemetry is **on**.
   - Optional `docs` URL and `notes` for quirks.
4. Golden tests iterate the full `REGISTRY` — new entries are covered automatically. Add a focused test only for special matching rules.
5. Update `README.md` only if the public command surface changes (registry details live in source).

### Unsupported (config-only) tools

If there is no env-var opt-out, add `kind: "unsupported"` with a short `notes` string. Do not invent env vars.

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

Command-scoped CLI flags: `init` owns `--yes` / `--dry-run` / `--target`; `doctor`/`check` own `--only` / `--ignore` / `--all`. Cross-use is a usage error (exit 2).

CLI human table formatting is **not** a stable contract — use `--json` and exit codes.

Machine status tokens: `disabled` | `enabled` | `not_applicable` | `not_found` | `unsupported`.

## Release checklist (maintainers)

- [ ] `CHANGELOG.md` updated
- [ ] `pnpm test` + `pnpm run check` + `pnpm run build`
- [ ] `npm pack --dry-run` includes `dist/` and `skills/`
- [ ] Version bump (`bumpp` or manual)
