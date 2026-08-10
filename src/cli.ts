#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { applyInit, failsCheck, planInit, scan, type LibraryResult, type Status } from "./core.ts";

const useColor = Boolean(output.isTTY) && !process.env.NO_COLOR;

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
  not_applicable: "— n/a",
  not_found: "— not found",
  unsupported: "— unsupported",
};

function colorStatus(status: Status, plain: string): string {
  if (status === "disabled") return c.green(plain);
  if (status === "enabled") return c.red(plain);
  return c.dim(plain);
}

function printTable(results: LibraryResult[]): void {
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

/** Applicable = evaluation already decided status is disabled or enabled. */
function printSummary(results: LibraryResult[]): void {
  const applicable = results.filter((r) => r.status === "disabled" || r.status === "enabled");
  const ok = applicable.filter((r) => r.status === "disabled").length;
  console.log(`\n${ok} of ${applicable.length} applicable libraries have telemetry disabled.`);
}

function report(cwd: string): LibraryResult[] {
  const results = scan(cwd);
  printTable(results);
  printSummary(results);
  return results;
}

function doctor(cwd: string): number {
  report(cwd);
  return 0;
}

function check(cwd: string): number {
  const results = report(cwd);
  if (results.some(failsCheck)) {
    console.log(c.red("\ncheck failed: one or more libraries still send telemetry."));
    return 1;
  }
  return 0;
}

async function confirm(msg: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const ans = await rl.question(msg);
    return ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function init(cwd: string, opts: { yes: boolean; dryRun: boolean }): Promise<number> {
  let plan;
  try {
    plan = planInit(cwd);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }

  const adds = plan.filter((p) => p.kind === "add");
  const oks = plan.filter((p) => p.kind === "ok");
  const conflicts = plan.filter((p) => p.kind === "conflict");

  if (adds.length === 0 && conflicts.length === 0) {
    console.log("Nothing to do — all known opt-outs already set.");
    if (oks.length) {
      for (const p of oks) console.log(c.dim(`  ${p.env.key}=${p.env.value}`));
    }
    return 0;
  }

  console.log("Will write to .env:\n");
  for (const p of adds) {
    console.log(c.green(`  + ${p.env.key}=${p.env.value}`));
  }
  for (const p of oks) {
    console.log(c.dim(`  · ${p.env.key}=${p.env.value} (already set)`));
  }
  for (const p of conflicts) {
    console.log(
      c.red(`  ! ${p.env.key} conflict: have "${p.existing}", want "${p.env.value}" (skipped)`),
    );
  }

  if (opts.dryRun) {
    console.log("\n(dry-run — no files written)");
    return 0;
  }

  if (!opts.yes) {
    const ok = await confirm("\nWrite these vars to .env? [y/N] ");
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const { added, already, conflict } = applyInit(cwd, plan);
  console.log(`\n${added} vars added, ${already} already set, ${conflict} skipped (conflict).`);
  return 0;
}

function usage(): void {
  console.log(`no-telemetry — disable JS/TS library telemetry

Usage:
  no-telemetry init [--yes|-y] [--dry-run]
  no-telemetry doctor
  no-telemetry check

Commands:
  init     Detect installed libraries and write opt-out env vars to .env
  doctor   Report telemetry status per library (exit 0)
  check    Same as doctor, but exit 1 if any telemetry is still enabled
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("-"));
  const yes = args.includes("--yes") || args.includes("-y");
  const dryRun = args.includes("--dry-run");
  const cwd = process.cwd();

  if (!cmd || cmd === "help" || args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(cmd || args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  let code = 0;
  try {
    if (cmd === "doctor") code = doctor(cwd);
    else if (cmd === "check") code = check(cwd);
    else if (cmd === "init") code = await init(cwd, { yes, dryRun });
    else {
      console.error(`Unknown command: ${cmd}\n`);
      usage();
      code = 1;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    code = 1;
  }
  process.exit(code);
}

void main();
