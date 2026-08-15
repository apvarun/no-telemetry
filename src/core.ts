import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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

/** Init write targets. Default `.env`. */
export type InitTarget = ".env" | ".env.local" | ".env.example" | "stdout";

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
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
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
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Load a single env file relative to cwd. Missing file → {}. */
export function loadEnvFile(cwd: string, fileName = ".env"): Record<string, string> {
  const path = join(cwd, fileName);
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
  processEnv: NodeJS.ProcessEnv = process.env,
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
  processEnv: NodeJS.ProcessEnv = process.env,
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
  processEnv: NodeJS.ProcessEnv = process.env,
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
      const primaryHit = primary.actual === entry.env.value ? entry.env : undefined;
      const canUseAlternates = entry.alternatePolicy !== "fallback" || primary.actual === undefined;
      const alternateHit = canUseAlternates
        ? signals.slice(1).find((s, i) => env[i + 1]!.actual === s.value)
        : undefined;
      const hit = primaryHit ?? alternateHit;
      if (hit) {
        return result(entry, true, "disabled", `${hit.key}=${hit.value}`, env);
      }
      const detail =
        primary.actual === undefined
          ? `${entry.env.key} (not set)`
          : `${entry.env.key}=${primary.actual} (want ${entry.env.value})`;
      return result(entry, true, "enabled", detail, env);
    }
  }
}

export function scan(
  cwd: string,
  processEnv: NodeJS.ProcessEnv = process.env,
  options: ScanOptions = {},
): LibraryResult[] {
  const deps = readDeps(cwd);
  const fileEnv = loadProjectEnv(cwd, options.envFiles);
  return REGISTRY.map((e) => evaluate(e, deps, fileEnv, processEnv));
}

export type InitPlanItem =
  | { kind: "add"; env: EnvOptOut }
  | { kind: "ok"; env: EnvOptOut }
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
    else if (existing === env.value) items.push({ kind: "ok", env });
    else items.push({ kind: "conflict", env, existing });
  }
  return items;
}

/** Comment header written above vars for auditability (`# no-telemetry <ver> - ISO`). */
export function initCommentBlock(version = "0.0.0", when = new Date()): string {
  return `# no-telemetry ${version} - ${when.toISOString()}`;
}

/** Append missing keys to target file; never overwrite. stdout returns lines only. */
export function applyInit(
  cwd: string,
  plan: InitPlanItem[],
  options: ApplyInitOptions = {},
): ApplyInitResult {
  const target = options.target ?? ".env";
  const toAdd = plan.filter((p) => p.kind === "add");
  const already = plan.filter((p) => p.kind === "ok").length;
  const conflict = plan.filter((p) => p.kind === "conflict").length;
  const lines = toAdd.map((p) => `${p.env.key}=${p.env.value}`);

  if (toAdd.length === 0) {
    return { added: 0, already, conflict, lines: [], path: null };
  }

  if (target === "stdout") {
    return { added: toAdd.length, already, conflict, lines, path: null };
  }

  const path = join(cwd, target);
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (content && !content.endsWith("\n")) content += "\n";

  const block = ["", initCommentBlock(options.version ?? "0.0.0"), ...lines, ""].join("\n");

  writeFileSync(path, content + block, "utf8");
  return { added: toAdd.length, already, conflict, lines, path };
}

/** Match --ignore ids against registry entry id or any package name. */
export function matchesIgnore(entry: RegistryEntry, ignoreIds: string[]): boolean {
  if (ignoreIds.length === 0) return false;
  const set = new Set(ignoreIds);
  if (set.has(entry.id)) return true;
  return entry.packages.some((p) => set.has(p) || set.has(p.replace(/\/\*$/, "")));
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
