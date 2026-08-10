# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
