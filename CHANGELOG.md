# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CLI: `list` - dump registry without a project (`--json` / `--json=compact`).
- CLI: `why <id>` - env, docs URL, notes, and alternate satisfaction signals.
- `--json=compact` one-line JSON; `--quiet` / `-q` suppresses stderr chatter (and implies compact when used with `--json`).
- `init --example` / `--target .env.example` for commit-safe opt-out templates.
- README CI snippet (copy-paste GitHub Actions `check` step).
- Optional CI job: fixture project (`next` + `turbo`) init → check smoke.
- `opt-out.alsoSatisfiedBy` - multi-key env satisfaction (e.g. Turbo via `DO_NOT_TRACK=1`).
- `opt-out.alternatePolicy` - fallback alternates for tools whose primary env key takes precedence.
- `FORCE_COLOR` support; clearer `NO_COLOR` behavior (any non-empty value disables color).
- Versioned generator comment: `# no-telemetry <version> - <ISO timestamp>`.
- Registry schema / id-stability notes in `CONTRIBUTING.md`.

### Fixed

- GitHub CLI checks now respect `GH_TELEMETRY` precedence over `DO_NOT_TRACK`.
- `FORCE_COLOR=0`, quiet runtime diagnostics, and missing-argument JSON errors now follow their documented output contracts.
- Hookdeck CLI opt-out key corrected to `HOOKDECK_CLI_TELEMETRY_DISABLED`.
- Filled remaining `docs` gaps (every registry entry now cites official docs).

## [0.1.0] - 2026-08-10

### Added

- CLI: `init`, `doctor`, `check`.
- Curated registry (~45 entries): frameworks (Angular, Strapi, Redwood, …), deploy CLIs (Vercel, Railway, AWS CDK/Blocks, Serverless, Salesforce, Supabase, Stripe CLI, …), data tools (Cube, Hasura, Meilisearch), Sentry/Promptfoo, AI/agent CLIs (Claude Code, Gemini CLI, GitHub CLI), plus config-only `unsupported` rows (Ionic, Capacitor, Amplify, Yarn, Firebase tools, Stencil).
- Optional `docs` field on registry entries for verification links.
- Agent-ready structured I/O: `--json` on all commands with report shape `version: 1`.
- `init --target .env | .env.local | stdout` (default `.env`).
- Non-interactive policy: when stdin is not a TTY or `CI=true`, `init` requires `--yes` / `-y`.
- Filters: `--only installed|failing`, `--ignore <id>`, human table hides `not_found` unless `--all`.
- `--version` / `-V` and polished `--help` (exit codes documented).
- Programmatic API: `scan`, `planInit`, `applyInit`, `failsCheck`, `buildReport`, `filterResults`, `REGISTRY`.
- `LibraryResult.env` with source tracking (`process-env` | `env-file` | `unset`).
- Agent skill: `skills/no-telemetry/SKILL.md`.
- Golden registry fixtures, CLI integration tests, GitHub Actions CI.
- `CHANGELOG.md`, `CONTRIBUTING.md`.
- Zero production dependencies; Node 18+.

### Behavior

- Exit **0** success; **1** policy failure (`check` / aborted `init`); **2** tool/usage errors.
- `doctor` / `check` load `.env` then `.env.local` (local wins); process env overrides both.
- `init` never overwrites conflicting values; always includes `DO_NOT_TRACK=1`.
- Command-scoped flags: wrong-command flags are usage errors (exit 2), not silent no-ops.
- JSON errors use the same `version: 1` report shape with optional `error` (empty summary/libraries).
