# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-10-11

### Added

- `run -- <command>` injects opt-outs with include/ignore filters and inherits streams and propagates child exits and signals. No project required.
- Exported pure `buildRunEnv` environment builder.
- Reports show winning sources and shadowed assignments. `init` identifies conflicts and overrides.
- 35 registry entries, verification metadata, and a coverage review with evidence.
- Packed `run` smoke tests on Node 18/20/22.

### Fixed

- Corrected package matches and accepted values; removed unverified wrappers and SDK matches.
- Corrected Yarn, Google Cloud, Firebase, and Prisma controls. Sentry CLI remains unsupported.
- Registry and package tests use data-derived expectations.

## [0.2.0]

### Added

- `init --target` now accepts arbitrary env-file paths, including nested monorepo targets.
- Generated opt-outs now live in one marker-delimited section so later additions do not append another dated block.

### Fixed

- Checks now honor documented multi-value and non-empty opt-out semantics.
- Inline comments in unquoted dotenv values no longer cause false policy failures.
- `init` fills empty dotenv placeholders in place without creating duplicate keys.
- `init --json` reports against the current process environment and selected target.
- `--ignore` and `why` now share case-insensitive id, display-name, package, and scope matching; unknown ignores fail clearly.
- `init --target stdout` keeps prompts, diagnostics, and JSON errors off the dotenv stream.
- `--quiet` no longer hides fatal errors or successful file-target init results.
- JSON summaries retain full policy counts when `--only` filters displayed libraries.
- Malformed `package.json` errors identify the file and preserve the parser detail.
- Public declarations compile without requiring consumers to install `@types/node`.

### Removed

- Removed the undocumented, side-effectful `no-telemetry/cli` package subpath; the `no-telemetry` binary remains the CLI entry point.

## [0.1.0]

### Added

- CLI commands: `init`, `doctor`, `check`, `list`, and `why <id>`.
- Versioned `--json` and one-line `--json=compact` output on every command.
- `--quiet` / `-q`, command-scoped flags, `--version`, and documented exit codes.
- `init --target .env|.env.local|.env.example|stdout`, `--example`, `--dry-run`, and non-interactive `--yes` enforcement.
- Doctor/check filters: `--only installed|failing`, `--ignore <id>`, and `--all`.
- Curated 43-entry registry with stable IDs, official docs, opt-out, opt-in, and unsupported entries.
- Alternate environment bindings with `"or"` and primary-key `"fallback"` precedence policies.
- Environment source tracking across process env, `.env`, and `.env.local`.
- ESM-only typed programmatic API: `scan`, `planInit`, `applyInit`, `failsCheck`, `buildReport`, `filterResults`, and `REGISTRY`.
- Agent guidance in `skills/no-telemetry/SKILL.md` and registry contribution guidance.
- Packed-package acceptance covering contents, zero runtime dependencies, ESM imports, declarations, CLI commands, and an `init` → `check` fixture.
- CI quality checks on Node 22 and tarball runtime smoke tests on Node 18, 20, and 22.
- `NO_COLOR` and `FORCE_COLOR` terminal behavior.
- Versioned generated-file comment: `# no-telemetry <version> - <ISO timestamp>`.

### Fixed

- GitHub CLI checks respect `GH_TELEMETRY` precedence over `DO_NOT_TRACK`, while entries such as Turbo retain unconditional OR behavior.
- `FORCE_COLOR=0`, quiet runtime and unknown-command diagnostics, and missing-argument JSON errors follow their output contracts.
- Hookdeck CLI uses the documented `HOOKDECK_CLI_TELEMETRY_DISABLED` key.
- Every registry entry now cites official documentation.

### Behavior

- Exit 0 means success, exit 1 means policy failure or an aborted interactive init, and exit 2 means a usage or runtime error.
- Process environment overrides env files; `.env.local` overrides `.env`.
- `init` never overwrites conflicting values and always includes `DO_NOT_TRACK=1`.
- Human output hides `not_found` rows by default; machine output retains stable status tokens.
- JSON errors use the same `ReportV1` shape with `version: 1`, empty summary/libraries, and an `error` field.
- Non-empty `NO_COLOR` takes precedence over `FORCE_COLOR`; otherwise `FORCE_COLOR=0` disables color and another non-empty value enables it.
