import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DO_NOT_TRACK, REGISTRY, type EnvOptOut, type RegistryEntry } from "./registry.ts";

/** Machine-stable status tokens (CLI maps these to display labels). */
export type Status = "disabled" | "enabled" | "not_applicable" | "not_found" | "unsupported";

/** Where a resolved env value came from (process wins over file). */
export type EnvSource = "process-env" | "env-file" | "unset";

/** Structured env observation for agents / JSON reports. */
export type EnvBinding = {
  key: string;
  want?: string;
  actual?: string;
  source: EnvSource;
};

export type LibraryResult = {
  entry: RegistryEntry;
  installed: boolean;
  status: Status;
  detail: string;
  /** Env keys relevant to this library (primary + optional alsoSatisfiedBy bindings). */
  env: EnvBinding[];
};

/** Init write target path, or `stdout`. Default `.env`. */
export type InitTarget = string;

export type ScanOptions = {
  /**
   * Env files to load (later files override earlier).
   * Default: `[".env", ".env.local"]` so init --target .env.local is visible to doctor/check.
   */
  envFiles?: string[];
};

export type PlanInitOptions = {
  /** File to read/write. `stdout` plans against an empty file view. Default `.env`. */
  target?: InitTarget;
};

export type ApplyInitOptions = {
  /** Where to write adds. `stdout` returns lines without writing. Default `.env`. */
  target?: InitTarget;
  /** Version string embedded in the generated comment block. */
  version?: string;
};

export type ApplyInitResult = {
  added: number;
  filled: number;
  already: number;
  conflict: number;
  /** KEY=VALUE lines that were or would be written (including dry stdout). */
  lines: string[];
  /** Absolute path written, or null when target is stdout / nothing written. */
  path: string | null;
};

/** Policy fail for `check` - currently identical to status === "enabled". */
export function failsCheck(result: LibraryResult): boolean {
  return result.status === "enabled";
}

export function readDeps(cwd: string): Set<string> {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) throw new Error(`No package.json in ${cwd}`);
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid package.json at ${path}: ${message}`);
  }
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

export function packageMatches(pattern: string, deps: Set<string>): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // keep trailing /
    for (const d of deps) if (d.startsWith(prefix)) return true;
    return false;
  }
  return deps.has(pattern);
}

export function isInstalled(entry: RegistryEntry, deps: Set<string>): boolean {
  return entry.packages.some((p) => packageMatches(p, deps));
}

/** Minimal .env parser - KEY=VALUE, optional quotes, # comments. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = stripEnvComment(t.slice(i + 1)).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Strip a dotenv-style inline comment while preserving # inside quotes. */
function stripEnvComment(value: string): string {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#") return value.slice(0, i);
  }
  return value;
}

/** Load a single env file relative to cwd. Missing file → {}. */
export function loadEnvFile(cwd: string, fileName = ".env"): Record<string, string> {
  const path = resolve(cwd, fileName);
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

/**
 * Merge project env files (later overrides earlier).
 * Default layers: `.env` then `.env.local` (Next.js-style).
 */
export function loadProjectEnv(
  cwd: string,
  envFiles: string[] = [".env", ".env.local"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of envFiles) {
    Object.assign(out, loadEnvFile(cwd, f));
  }
  return out;
}

/** process.env wins over file env; returns value + source. */
export function resolveEnvBinding(
  key: string,
  fileEnv: Record<string, string>,
  processEnv: Record<string, string | undefined> = process.env,
  want?: string,
): EnvBinding {
  if (processEnv[key] !== undefined) {
    return { key, want, actual: processEnv[key], source: "process-env" };
  }
  if (fileEnv[key] !== undefined) {
    return { key, want, actual: fileEnv[key], source: "env-file" };
  }
  return { key, want, source: "unset" };
}

/** process.env wins over .env (value only; prefer resolveEnvBinding for source). */
export function resolveEnv(
  key: string,
  fileEnv: Record<string, string>,
  processEnv: Record<string, string | undefined> = process.env,
): string | undefined {
  return resolveEnvBinding(key, fileEnv, processEnv).actual;
}

function result(
  entry: RegistryEntry,
  installed: boolean,
  status: Status,
  detail: string,
  env: EnvBinding[],
): LibraryResult {
  return { entry, installed, status, detail, env };
}

export function evaluate(
  entry: RegistryEntry,
  deps: Set<string>,
  fileEnv: Record<string, string>,
  processEnv: Record<string, string | undefined> = process.env,
): LibraryResult {
  if (!isInstalled(entry, deps)) {
    return result(entry, false, "not_found", "(package not installed)", []);
  }

  switch (entry.kind) {
    case "unsupported":
      return result(
        entry,
        true,
        "unsupported",
        entry.notes ? `(${entry.notes})` : "(opt-out is config-based - not supported yet)",
        [],
      );

    case "opt-in": {
      const binding = resolveEnvBinding(entry.env.key, fileEnv, processEnv, entry.env.value);
      if (binding.actual !== undefined && entry.enableWhen.includes(binding.actual)) {
        return result(entry, true, "enabled", `${entry.env.key}=${binding.actual}`, [binding]);
      }
      return result(entry, true, "not_applicable", "(opt-in, not enabled - no action needed)", [
        binding,
      ]);
    }

    case "opt-out": {
      // Primary first. Fallback alternates only apply while the primary key is unset.
      const signals = [entry.env, ...(entry.alsoSatisfiedBy ?? [])];
      const env = signals.map((s) => resolveEnvBinding(s.key, fileEnv, processEnv, s.value));
      const primary = env[0]!;
      const primaryHit = matchesOptOut(entry.env, primary.actual) ? 0 : undefined;
      const canUseAlternates = entry.alternatePolicy !== "fallback" || primary.actual === undefined;
      const alternateHit = canUseAlternates
        ? signals.slice(1).findIndex((s, i) => matchesOptOut(s, env[i + 1]!.actual))
        : undefined;
      const hitIndex =
        primaryHit ??
        (alternateHit !== undefined && alternateHit >= 0 ? alternateHit + 1 : undefined);
      if (hitIndex !== undefined) {
        const hit = env[hitIndex]!;
        return result(entry, true, "disabled", `${hit.key}=${hit.actual}`, env);
      }
      const detail =
        primary.actual === undefined
          ? `${entry.env.key} (not set)`
          : `${entry.env.key}=${primary.actual} (want ${entry.env.value})`;
      return result(entry, true, "enabled", detail, env);
    }
  }
}

/** Whether an observed value satisfies an opt-out binding's documented semantics. */
export function matchesOptOut(env: EnvOptOut, actual: string | undefined): boolean {
  if (actual === undefined) return false;
  if (env.accepts === "non-empty") return actual.length > 0;
  return (env.accepts ?? [env.value]).includes(actual);
}

export function scan(
  cwd: string,
  processEnv: Record<string, string | undefined> = process.env,
  options: ScanOptions = {},
): LibraryResult[] {
  const deps = readDeps(cwd);
  const fileEnv = loadProjectEnv(cwd, options.envFiles);
  return REGISTRY.map((e) => evaluate(e, deps, fileEnv, processEnv));
}

export type InitPlanItem =
  | { kind: "add"; env: EnvOptOut }
  | { kind: "fill"; env: EnvOptOut; existing: "" }
  | { kind: "ok"; env: EnvOptOut; existing: string }
  | { kind: "conflict"; env: EnvOptOut; existing: string };

function targetFileName(target: InitTarget): string | null {
  if (target === "stdout") return null;
  return target;
}

export function planInit(cwd: string, options: PlanInitOptions = {}): InitPlanItem[] {
  const target = options.target ?? ".env";
  const deps = readDeps(cwd);
  // init only cares about the write-target file - shell env is session-local
  const fileName = targetFileName(target);
  const fileEnv = fileName ? loadEnvFile(cwd, fileName) : {};

  const wanted: EnvOptOut[] = [DO_NOT_TRACK];
  for (const entry of REGISTRY) {
    if (!isInstalled(entry, deps)) continue;
    // Only env opt-outs are written; opt-in stays off by default; unsupported has no env.
    if (entry.kind !== "opt-out") continue;
    wanted.push(entry.env);
  }

  // de-dupe by key
  const seen = new Set<string>();
  const items: InitPlanItem[] = [];
  for (const env of wanted) {
    if (seen.has(env.key)) continue;
    seen.add(env.key);
    const existing = fileEnv[env.key];
    if (existing === undefined) items.push({ kind: "add", env });
    else if (existing === "") items.push({ kind: "fill", env, existing });
    else if (matchesOptOut(env, existing)) items.push({ kind: "ok", env, existing });
    else items.push({ kind: "conflict", env, existing });
  }
  return items;
}

/** Comment header written above vars for auditability (`# no-telemetry <ver> - ISO`). */
export function initCommentBlock(version = "0.0.0", when = new Date()): string {
  return `# no-telemetry ${version} - ${when.toISOString()}`;
}

const INIT_START = "# no-telemetry:start";
const INIT_END = "# no-telemetry:end";

/** Fill empty placeholders and append missing keys. Non-empty values are never overwritten. */
export function applyInit(
  cwd: string,
  plan: InitPlanItem[],
  options: ApplyInitOptions = {},
): ApplyInitResult {
  const target = options.target ?? ".env";
  const toAdd = plan.filter((p) => p.kind === "add");
  const toFill = plan.filter((p) => p.kind === "fill");
  const already = plan.filter((p) => p.kind === "ok").length;
  const conflict = plan.filter((p) => p.kind === "conflict").length;
  const lines = [...toFill, ...toAdd].map((p) => `${p.env.key}=${p.env.value}`);

  if (toAdd.length === 0 && toFill.length === 0) {
    return { added: 0, filled: 0, already, conflict, lines: [], path: null };
  }

  if (target === "stdout") {
    return { added: toAdd.length, filled: toFill.length, already, conflict, lines, path: null };
  }

  const path = resolve(cwd, target);
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  content = fillPlaceholders(content, toFill);
  const addLines = toAdd.map((p) => `${p.env.key}=${p.env.value}`);
  if (addLines.length > 0) {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const start = content.indexOf(INIT_START);
    const end = content.indexOf(INIT_END);
    if (start !== -1 && end > start) {
      content = `${content.slice(0, end)}${addLines.join(newline)}${newline}${content.slice(end)}`;
    } else {
      if (content && !content.endsWith("\n")) content += newline;
      if (content) content += newline;
      content += [
        INIT_START,
        initCommentBlock(options.version ?? "0.0.0"),
        ...addLines,
        INIT_END,
        "",
      ].join(newline);
    }
  }

  writeFileSync(path, content, "utf8");
  return { added: toAdd.length, filled: toFill.length, already, conflict, lines, path };
}

function fillPlaceholders(
  content: string,
  fills: Extract<InitPlanItem, { kind: "fill" }>[],
): string {
  if (fills.length === 0) return content;
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  for (const fill of fills) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = parseEnvFile(lines[i]!);
      if (Object.hasOwn(parsed, fill.env.key) && parsed[fill.env.key] === "") {
        lines[i] = `${fill.env.key}=${fill.env.value}`;
        break;
      }
    }
  }
  return lines.join(newline);
}

/** Match a registry entry by id, display name, package, or scoped package pattern. */
export function entryMatches(entry: RegistryEntry, value: string): boolean {
  const needle = value.toLowerCase();
  if (entry.id.toLowerCase() === needle || entry.name.toLowerCase() === needle) return true;
  return entry.packages.some((packageName) => {
    const pattern = packageName.toLowerCase();
    if (!pattern.endsWith("/*")) return pattern === needle;
    const scope = pattern.slice(0, -2);
    return needle === scope || needle.startsWith(`${scope}/`);
  });
}

/** Match --ignore values against registry entry ids, names, or packages. */
export function matchesIgnore(entry: RegistryEntry, ignoreIds: string[]): boolean {
  return ignoreIds.some((value) => entryMatches(entry, value));
}

export type FilterOptions = {
  /** `installed` = drop not_found; `failing` = failsCheck only. */
  only?: "installed" | "failing";
  /** Hide not_found rows (human default). Ignored when only is set. */
  hideNotFound?: boolean;
  ignore?: string[];
};

/** Presentation / ignore filter - does not change scan() or policy inputs. */
export function filterResults(results: LibraryResult[], opts: FilterOptions = {}): LibraryResult[] {
  let out = results;
  if (opts.ignore?.length) {
    out = out.filter((r) => !matchesIgnore(r.entry, opts.ignore!));
  }
  if (opts.only === "installed") {
    out = out.filter((r) => r.installed);
  } else if (opts.only === "failing") {
    out = out.filter((r) => failsCheck(r));
  } else if (opts.hideNotFound) {
    out = out.filter((r) => r.status !== "not_found");
  }
  return out;
}
