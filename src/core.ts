import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DO_NOT_TRACK, REGISTRY, type EnvOptOut, type RegistryEntry } from "./registry.ts";

/** Machine-stable status tokens (CLI maps these to display labels). */
export type Status = "disabled" | "enabled" | "not_applicable" | "not_found" | "unsupported";

export type LibraryResult = {
  entry: RegistryEntry;
  installed: boolean;
  status: Status;
  detail: string;
};

/** Policy fail for `check` — currently identical to status === "enabled". */
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

/** Minimal .env parser — KEY=VALUE, optional quotes, # comments. */
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

export function loadEnvFile(cwd: string): Record<string, string> {
  const path = join(cwd, ".env");
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

/** process.env wins over .env */
export function resolveEnv(
  key: string,
  fileEnv: Record<string, string>,
  processEnv: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromProc = processEnv[key];
  if (fromProc !== undefined) return fromProc;
  return fileEnv[key];
}

function result(
  entry: RegistryEntry,
  installed: boolean,
  status: Status,
  detail: string,
): LibraryResult {
  return { entry, installed, status, detail };
}

export function evaluate(
  entry: RegistryEntry,
  deps: Set<string>,
  fileEnv: Record<string, string>,
  processEnv: NodeJS.ProcessEnv = process.env,
): LibraryResult {
  if (!isInstalled(entry, deps)) {
    return result(entry, false, "not_found", "(package not installed)");
  }

  switch (entry.kind) {
    case "unsupported":
      return result(
        entry,
        true,
        "unsupported",
        entry.notes ? `(${entry.notes})` : "(opt-out is config-based — not supported yet)",
      );

    case "opt-in": {
      const current = resolveEnv(entry.env.key, fileEnv, processEnv);
      if (current !== undefined && entry.enableWhen.includes(current)) {
        return result(entry, true, "enabled", `${entry.env.key}=${current}`);
      }
      return result(entry, true, "not_applicable", "(opt-in, not enabled — no action needed)");
    }

    case "opt-out": {
      const current = resolveEnv(entry.env.key, fileEnv, processEnv);
      if (current === entry.env.value) {
        return result(entry, true, "disabled", `${entry.env.key}=${entry.env.value}`);
      }
      const detail =
        current === undefined
          ? `${entry.env.key} (not set)`
          : `${entry.env.key}=${current} (want ${entry.env.value})`;
      return result(entry, true, "enabled", detail);
    }
  }
}

export function scan(cwd: string, processEnv: NodeJS.ProcessEnv = process.env): LibraryResult[] {
  const deps = readDeps(cwd);
  const fileEnv = loadEnvFile(cwd);
  return REGISTRY.map((e) => evaluate(e, deps, fileEnv, processEnv));
}

export type InitPlanItem =
  | { kind: "add"; env: EnvOptOut }
  | { kind: "ok"; env: EnvOptOut }
  | { kind: "conflict"; env: EnvOptOut; existing: string };

export function planInit(cwd: string): InitPlanItem[] {
  const deps = readDeps(cwd);
  // init only cares about .env — shell env is session-local
  const fileEnv = loadEnvFile(cwd);

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

/** Append missing keys to .env; never overwrite. Returns counts. */
export function applyInit(
  cwd: string,
  plan: InitPlanItem[],
): { added: number; already: number; conflict: number } {
  const toAdd = plan.filter((p) => p.kind === "add");
  const already = plan.filter((p) => p.kind === "ok").length;
  const conflict = plan.filter((p) => p.kind === "conflict").length;

  if (toAdd.length === 0) {
    return { added: 0, already, conflict };
  }

  const path = join(cwd, ".env");
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (content && !content.endsWith("\n")) content += "\n";

  const block = ["", "# no-telemetry", ...toAdd.map((p) => `${p.env.key}=${p.env.value}`), ""].join(
    "\n",
  );

  writeFileSync(path, content + block, "utf8");
  return { added: toAdd.length, already, conflict };
}
