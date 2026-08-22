#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyInit,
  entryMatches,
  failsCheck,
  filterResults,
  parseEnvFile,
  planInit,
  scan,
  type InitPlanItem,
  type InitTarget,
  type LibraryResult,
  type Status,
} from "./core.ts";
import { REGISTRY, type RegistryEntry } from "./registry.ts";
import {
  buildErrorReport,
  buildReport,
  planToActions,
  summarize,
  type ReportAction,
  type ReportV1,
} from "./report.ts";
import { shouldUseColor } from "./terminal.ts";

const useColor = shouldUseColor(Boolean(output.isTTY), process.env);

const c = {
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

/** Human labels for machine status tokens. */
const STATUS_PLAIN: Record<Status, string> = {
  disabled: "✓ disabled",
  enabled: "✗ enabled",
  not_applicable: "- n/a",
  not_found: "- not found",
  unsupported: "- unsupported",
};

/** Tool / usage errors → exit 2. Policy fails (check) → 1. */
const EXIT_OK = 0;
const EXIT_POLICY = 1;
const EXIT_ERROR = 2;

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const p of [join(here, "..", "package.json"), join(here, "package.json")]) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }
  return "0.0.0";
}

function colorStatus(status: Status, plain: string): string {
  if (status === "disabled") return c.green(plain);
  if (status === "enabled") return c.red(plain);
  return c.dim(plain);
}

function printTable(results: LibraryResult[]): void {
  if (results.length === 0) {
    console.log(c.dim("(no libraries to show)"));
    return;
  }
  const libW = Math.max(8, ...results.map((r) => r.entry.name.length));
  const stW = Math.max(10, ...results.map((r) => STATUS_PLAIN[r.status].length));

  console.log(
    `${c.bold("Library".padEnd(libW))}  ${c.bold("Status".padEnd(stW))}  ${c.bold("Variable")}`,
  );
  console.log("─".repeat(libW + stW + 24));

  for (const r of results) {
    const plain = STATUS_PLAIN[r.status];
    const st = colorStatus(r.status, plain);
    const pad = stW - plain.length;
    console.log(`${r.entry.name.padEnd(libW)}  ${st}${" ".repeat(pad)}  ${r.detail}`);
  }
}

function printSummary(results: LibraryResult[]): void {
  const { disabled, applicable } = summarize(results);
  console.log(`\n${disabled} of ${applicable} applicable libraries have telemetry disabled.`);
}

type JsonMode = false | "pretty" | "compact";

type CliFlags = {
  cmd: string | undefined;
  /** Positional arg after command (e.g. why <id>). */
  arg: string | undefined;
  yes: boolean;
  dryRun: boolean;
  json: JsonMode;
  quiet: boolean;
  all: boolean;
  only: "installed" | "failing" | undefined;
  ignore: string[];
  target: InitTarget;
  /** True when user passed --target or --example. */
  targetSet: boolean;
  help: boolean;
  version: boolean;
};

/** Human diagnostics → stderr. Suppressed when --quiet. */
function log(flags: CliFlags, ...args: unknown[]): void {
  if (flags.quiet) return;
  console.error(...args);
}

function fatal(...args: unknown[]): void {
  console.error(...args);
}

function writeJson(value: unknown, flags: CliFlags, stream: "stdout" | "stderr" = "stdout"): void {
  const body =
    flags.json === "compact" ? JSON.stringify(value) + "\n" : JSON.stringify(value, null, 2) + "\n";
  if (stream === "stderr") stderr.write(body);
  else process.stdout.write(body);
}

function emitJson(report: ReportV1, flags: CliFlags, stream: "stdout" | "stderr" = "stdout"): void {
  writeJson(report, flags, stream);
}

/** Public registry row for list/why JSON. */
function entryPublic(e: RegistryEntry) {
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    packages: [...e.packages],
    env:
      e.kind === "opt-out" || e.kind === "opt-in"
        ? {
            ...e.env,
            ...(e.kind === "opt-out" && e.alsoSatisfiedBy?.length
              ? {
                  alsoSatisfiedBy: e.alsoSatisfiedBy,
                  alternatePolicy: e.alternatePolicy ?? "or",
                }
              : {}),
            ...(e.kind === "opt-in" ? { enableWhen: [...e.enableWhen] } : {}),
          }
        : null,
    docs: e.docs ?? null,
    notes: e.notes ?? null,
  };
}

function takeValue(argv: string[], i: number, flag: string): [string, number] {
  const v = argv[i + 1];
  if (!v || v.startsWith("-")) throw new UsageError(`${flag} requires a value`);
  return [v, i + 1];
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    cmd: undefined,
    arg: undefined,
    yes: false,
    dryRun: false,
    json: false,
    quiet: false,
    all: false,
    only: undefined,
    ignore: [],
    target: ".env",
    targetSet: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-V") flags.version = true;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--quiet" || a === "-q") flags.quiet = true;
    else if (a === "--example") {
      flags.target = ".env.example";
      flags.targetSet = true;
    } else if (a === "--json" || a.startsWith("--json=")) {
      const v = a === "--json" ? "pretty" : a.slice("--json=".length);
      if (v !== "compact" && v !== "pretty") {
        throw new UsageError(`--json expects compact or pretty, got ${v || "(empty)"}`);
      }
      flags.json = v;
    } else if (a === "--all") flags.all = true;
    else if (a === "--only" || a.startsWith("--only=")) {
      let v: string;
      if (a.startsWith("--only=")) v = a.slice("--only=".length);
      else [v, i] = takeValue(argv, i, "--only");
      if (v !== "installed" && v !== "failing") {
        throw new UsageError(`--only expects "installed" or "failing", got ${v || "(missing)"}`);
      }
      flags.only = v;
    } else if (a === "--ignore" || a.startsWith("--ignore=")) {
      let v: string;
      if (a.startsWith("--ignore=")) v = a.slice("--ignore=".length);
      else [v, i] = takeValue(argv, i, "--ignore");
      if (!v) throw new UsageError("--ignore requires an id (e.g. netlify-cli)");
      flags.ignore.push(v);
    } else if (a === "--target" || a.startsWith("--target=")) {
      let v: string;
      if (a.startsWith("--target=")) v = a.slice("--target=".length);
      else [v, i] = takeValue(argv, i, "--target");
      flags.target = parseTarget(v);
      flags.targetSet = true;
    } else if (a.startsWith("-") && a !== "-") {
      throw new UsageError(`Unknown flag: ${a}`);
    } else if (!flags.cmd) {
      flags.cmd = a;
    } else if (!flags.arg) {
      flags.arg = a;
    } else {
      throw new UsageError(`Unexpected argument: ${a}`);
    }
  }

  // --quiet with --json → compact one-line (agent pipes)
  if (flags.quiet && flags.json === "pretty") flags.json = "compact";

  return flags;
}

function parseTarget(v: string | undefined): InitTarget {
  if (v) return v;
  throw new UsageError("--target requires a path or stdout");
}

/** Allowed non-shared flags per command. Deny-by-default keeps list/why tight. */
const CMD_FLAGS: Record<string, ReadonlySet<string>> = {
  init: new Set(["yes", "dryRun", "target"]),
  doctor: new Set(["only", "ignore", "all"]),
  check: new Set(["only", "ignore", "all"]),
  list: new Set(),
  why: new Set(["arg"]),
};

function assertCommandFlags(flags: CliFlags): void {
  const cmd = flags.cmd;
  if (!cmd || cmd === "help" || !(cmd in CMD_FLAGS)) return;
  const allow = CMD_FLAGS[cmd]!;

  const checks: [boolean, string][] = [
    [flags.yes && !allow.has("yes"), "--yes is only valid with init"],
    [flags.dryRun && !allow.has("dryRun"), "--dry-run is only valid with init"],
    [flags.targetSet && !allow.has("target"), "--target/--example is only valid with init"],
    [!!flags.only && !allow.has("only"), "--only is only valid with doctor/check"],
    [flags.ignore.length > 0 && !allow.has("ignore"), "--ignore is only valid with doctor/check"],
    [flags.all && !allow.has("all"), "--all is only valid with doctor/check"],
    [!!flags.arg && !allow.has("arg"), `Unexpected argument: ${flags.arg}`],
  ];
  for (const [bad, msg] of checks) {
    if (bad) throw new UsageError(msg);
  }
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function isNonInteractive(): boolean {
  if (process.env.CI === "true" || process.env.CI === "1") return true;
  return input.isTTY !== true;
}

type StatusView = {
  policy: LibraryResult[];
  display: LibraryResult[];
  ignored: number;
};

/** Policy = full scan minus ignores. Display applies --only / hideNotFound. */
function prepareView(cwd: string, flags: CliFlags): StatusView {
  const full = scan(cwd);
  for (const value of flags.ignore) {
    if (!REGISTRY.some((entry) => entryMatches(entry, value))) {
      throw new UsageError(`Unknown --ignore value: ${value}`);
    }
  }
  const policy = filterResults(full, { ignore: flags.ignore });
  const ignored = flags.ignore.length ? full.length - policy.length : 0;
  const display = filterResults(policy, {
    only: flags.only,
    hideNotFound: !flags.json && !flags.all && !flags.only,
  });
  return { policy, display, ignored };
}

function emitStatus(cwd: string, flags: CliFlags, view: StatusView, failOnPolicy: boolean): number {
  const failed = failOnPolicy && view.policy.some(failsCheck);

  if (flags.json) {
    emitJson(
      buildReport(cwd, view.display, {
        ignored: view.ignored || undefined,
        summaryResults: view.policy,
      }),
      flags,
    );
  } else {
    printTable(view.display);
    printSummary(view.policy);
    if (failed) {
      console.log(c.red("\ncheck failed: one or more libraries still send telemetry."));
    }
  }
  return failed ? EXIT_POLICY : EXIT_OK;
}

function doctor(cwd: string, flags: CliFlags): number {
  return emitStatus(cwd, flags, prepareView(cwd, flags), false);
}

function check(cwd: string, flags: CliFlags): number {
  return emitStatus(cwd, flags, prepareView(cwd, flags), true);
}

/** Find registry entry by id or package name. */
function findEntry(idOrPkg: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entryMatches(entry, idOrPkg));
}

function listRegistry(flags: CliFlags): number {
  if (flags.json) {
    writeJson({ version: 1 as const, libraries: REGISTRY.map(entryPublic) }, flags);
    return EXIT_OK;
  }

  const idW = Math.max(4, ...REGISTRY.map((e) => e.id.length));
  const kindW = Math.max(4, ...REGISTRY.map((e) => e.kind.length));
  console.log(
    `${c.bold("id".padEnd(idW))}  ${c.bold("kind".padEnd(kindW))}  ${c.bold("env")}  ${c.bold("name")}`,
  );
  console.log("─".repeat(idW + kindW + 40));
  for (const e of REGISTRY) {
    const env = e.kind === "opt-out" || e.kind === "opt-in" ? `${e.env.key}=${e.env.value}` : "-";
    console.log(`${e.id.padEnd(idW)}  ${e.kind.padEnd(kindW)}  ${env}  ${e.name}`);
  }
  console.log(`\n${REGISTRY.length} entries`);
  return EXIT_OK;
}

function whyEntry(flags: CliFlags): number {
  const id = flags.arg;
  if (!id) {
    const msg = "usage: no-telemetry why <id>";
    if (flags.json) emitJson(buildErrorReport(process.cwd(), msg), flags);
    else fatal(msg);
    return EXIT_ERROR;
  }
  const entry = findEntry(id);
  if (!entry) {
    const msg = `Unknown library id: ${id}`;
    if (flags.json) emitJson(buildErrorReport(process.cwd(), msg), flags);
    else {
      fatal(msg);
      log(flags, c.dim("Run `no-telemetry list` to see registry ids."));
    }
    return EXIT_ERROR;
  }

  if (flags.json) {
    writeJson({ version: 1 as const, ...entryPublic(entry) }, flags);
    return EXIT_OK;
  }

  console.log(c.bold(entry.name) + c.dim(` (${entry.id})`));
  console.log(`  kind:     ${entry.kind}`);
  console.log(`  packages: ${entry.packages.join(", ")}`);
  if (entry.kind === "opt-out" || entry.kind === "opt-in") {
    console.log(`  env:      ${entry.env.key}=${entry.env.value}`);
    if (entry.kind === "opt-out" && entry.alsoSatisfiedBy?.length) {
      for (const a of entry.alsoSatisfiedBy) {
        console.log(`  also:     ${a.key}=${a.value}`);
      }
    }
    if (entry.kind === "opt-in") {
      console.log(`  on when:  ${entry.enableWhen.join(", ")}`);
    }
  } else {
    console.log(`  env:      (none - config/CLI only)`);
  }
  if (entry.docs) console.log(`  docs:     ${entry.docs}`);
  if (entry.notes) console.log(`  notes:    ${entry.notes}`);
  return EXIT_OK;
}

async function confirm(msg: string): Promise<boolean> {
  const rl = createInterface({ input, output: stderr });
  try {
    const ans = await rl.question(msg);
    return ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function emitInitError(
  cwd: string,
  flags: CliFlags,
  error: string,
  actions: ReportAction[] = [],
): void {
  if (flags.json) {
    emitJson(
      buildErrorReport(cwd, error, { actions }),
      flags,
      flags.target === "stdout" ? "stderr" : "stdout",
    );
  } else fatal(error);
}

function humanOut(flags: CliFlags): (...args: unknown[]) => void {
  if (flags.target !== "stdout") return console.log;
  return flags.quiet ? () => {} : (...args) => console.error(...args);
}

function emitInitSuccess(
  cwd: string,
  flags: CliFlags,
  actions: ReportAction[],
  message: string,
  opts: { dotenvLines?: string[] } = {},
): void {
  for (const line of opts.dotenvLines ?? []) console.log(line);

  if (flags.json) {
    const processEnv =
      flags.target === "stdout"
        ? { ...process.env, ...parseEnvFile((opts.dotenvLines ?? []).join("\n")) }
        : process.env;
    const envFiles = flags.target === "stdout" ? [] : [flags.target];
    const report = buildReport(cwd, scan(cwd, processEnv, { envFiles }), {
      actions: [...actions, { type: "message", message }],
    });
    // stdout is reserved for KEY=VAL lines when it is the selected target.
    emitJson(report, flags, flags.target === "stdout" ? "stderr" : "stdout");
    return;
  }

  humanOut(flags)(`\n${message}`);
}

function printInitPlan(
  out: (...args: unknown[]) => void,
  targetLabel: string,
  adds: Extract<InitPlanItem, { kind: "add" }>[],
  fills: Extract<InitPlanItem, { kind: "fill" }>[],
  oks: Extract<InitPlanItem, { kind: "ok" }>[],
  conflicts: Extract<InitPlanItem, { kind: "conflict" }>[],
): void {
  out(`Will write to ${targetLabel}:\n`);
  for (const p of adds) out(c.green(`  + ${p.env.key}=${p.env.value}`));
  for (const p of fills) out(c.green(`  ~ ${p.env.key}= → ${p.env.value}`));
  for (const p of oks) out(c.dim(`  · ${p.env.key}=${p.existing} (already set)`));
  for (const p of conflicts) {
    out(c.red(`  ! ${p.env.key} conflict: have "${p.existing}", want "${p.env.value}" (skipped)`));
  }
}

async function init(cwd: string, flags: CliFlags): Promise<number> {
  let plan: InitPlanItem[];
  try {
    plan = planInit(cwd, { target: flags.target });
  } catch (e) {
    emitInitError(cwd, flags, e instanceof Error ? e.message : String(e));
    return EXIT_ERROR;
  }

  const adds = plan.filter((p) => p.kind === "add");
  const fills = plan.filter((p) => p.kind === "fill");
  const oks = plan.filter((p) => p.kind === "ok");
  const conflicts = plan.filter((p) => p.kind === "conflict");
  const actions = planToActions(plan);
  const targetLabel = flags.target === "stdout" ? "stdout" : flags.target;
  const human = humanOut(flags);

  if (adds.length === 0 && fills.length === 0 && conflicts.length === 0) {
    if (flags.json) {
      emitInitSuccess(cwd, flags, actions, "Nothing to do - all known opt-outs already set.");
    } else {
      human("Nothing to do - all known opt-outs already set.");
      for (const p of oks) human(c.dim(`  ${p.env.key}=${p.existing}`));
    }
    return EXIT_OK;
  }

  if (!flags.json) printInitPlan(human, targetLabel, adds, fills, oks, conflicts);

  if (flags.dryRun) {
    const dotenvLines =
      flags.target === "stdout" ? adds.map((p) => `${p.env.key}=${p.env.value}`) : undefined;
    emitInitSuccess(cwd, flags, actions, "dry-run - no files written", { dotenvLines });
    return EXIT_OK;
  }

  if (!flags.yes) {
    if (isNonInteractive()) {
      emitInitError(
        cwd,
        flags,
        "non-interactive session: pass --yes (-y) to apply changes (refusing to prompt).",
        actions,
      );
      return EXIT_ERROR;
    }
    const ok = await confirm(`\nWrite these vars to ${targetLabel}? [y/N] `);
    if (!ok) {
      if (flags.json) emitInitError(cwd, flags, "Aborted.", actions);
      else human("Aborted.");
      return EXIT_POLICY;
    }
  }

  const result = applyInit(cwd, plan, { target: flags.target, version: packageVersion() });
  const verb = flags.target === "stdout" ? "emitted on stdout" : "added";
  const message = `${result.added} vars ${verb}, ${result.filled} placeholders filled, ${result.already} already set, ${result.conflict} skipped (conflict).`;
  emitInitSuccess(cwd, flags, actions, message, {
    dotenvLines: flags.target === "stdout" ? result.lines : undefined,
  });
  return EXIT_OK;
}

function usage(stream: { write(chunk: string): unknown } = output): void {
  stream.write(`no-telemetry - disable JS/TS library telemetry

Usage:
  no-telemetry init [options]
  no-telemetry doctor [options]
  no-telemetry check [options]
  no-telemetry list [options]
  no-telemetry why <id> [options]

Commands:
  init     Detect installed libraries and write opt-out env vars
  doctor   Report telemetry status per library (exit 0)
  check    Same as doctor, but exit 1 if any telemetry is still enabled
  list     Dump registry coverage (no package.json required)
  why      Explain one registry entry (env, docs, notes)

Shared options:
  --json[=pretty|compact]  Machine-readable JSON (default pretty; compact = one line)
  --quiet, -q              Suppress human diagnostics on stderr; with --json → compact
  --version, -V            Print version
  --help, -h               Show help

Color:
  NO_COLOR                 Disable ANSI colors (any non-empty value)
  FORCE_COLOR              Force colors even when not a TTY (not "0")

init options:
  --yes, -y                Skip confirmation (required when non-TTY or CI=true)
  --dry-run                Show plan without writing
  --target <path>          Env file path or stdout (default: .env)
  --example                Shorthand for --target .env.example (commit-safe)

doctor/check options:
  --only <filter>          installed | failing
  --ignore <value>         Omit library id/name/package from results and check policy
  --all                    Show not-found libraries in human table (hidden by default)

Exit codes:
  0  Success (doctor always; check when all applicable libs disabled)
  1  Policy failure (check: telemetry still enabled; init aborted)
  2  Tool/usage error (bad flags, missing package.json, non-interactive init without --yes)

Stable programmatic API (import "no-telemetry"):
  scan, planInit, applyInit, failsCheck, REGISTRY, buildReport, buildErrorReport
`);
}

async function main(): Promise<number> {
  let flags: CliFlags;
  try {
    flags = parseArgs(process.argv.slice(2));
    assertCommandFlags(flags);
  } catch (e) {
    if (e instanceof UsageError) {
      fatal(e.message);
      usage(stderr);
      return EXIT_ERROR;
    }
    throw e;
  }

  if (flags.version) {
    console.log(packageVersion());
    return EXIT_OK;
  }

  if (flags.help || flags.cmd === "help") {
    usage();
    return EXIT_OK;
  }

  if (!flags.cmd) {
    usage(stderr);
    return EXIT_ERROR;
  }

  const cwd = process.cwd();
  let code = EXIT_OK;
  try {
    if (flags.cmd === "doctor") code = doctor(cwd, flags);
    else if (flags.cmd === "check") code = check(cwd, flags);
    else if (flags.cmd === "init") code = await init(cwd, flags);
    else if (flags.cmd === "list") code = listRegistry(flags);
    else if (flags.cmd === "why") code = whyEntry(flags);
    else {
      fatal(`Unknown command: ${flags.cmd}\n`);
      usage(stderr);
      code = EXIT_ERROR;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (flags.json) {
      emitJson(
        buildErrorReport(cwd, msg),
        flags,
        flags.cmd === "init" && flags.target === "stdout" ? "stderr" : "stdout",
      );
    } else fatal(msg);
    code = EXIT_ERROR;
  }
  return code;
}

void main().then((code) => {
  process.exitCode = code;
});
