import { DO_NOT_TRACK, REGISTRY, type RegistryEntry } from "./registry.ts";

export type RunEnvOptions = {
  /** Registry IDs to include. Empty or omitted selects all entries. */
  include?: readonly string[];
  /** Registry IDs to exclude. Exclusions win over inclusions. */
  ignore?: readonly string[];
};

export type RunEnvResult = {
  env: Record<string, string | undefined>;
  /** Only assignments injected by this tool, never unrelated inherited values. */
  assignments: Record<string, string>;
};

/** Build an isolated child environment without reading files or mutating the input. */
export function buildRunEnv(
  inherited: Record<string, string | undefined>,
  options: RunEnvOptions = {},
  registry: readonly RegistryEntry[] = REGISTRY,
): RunEnvResult {
  const ids = new Set(registry.map((entry) => entry.id));
  for (const id of [...(options.include ?? []), ...(options.ignore ?? [])]) {
    if (!ids.has(id)) throw new Error(`Unknown registry id: ${id}`);
  }
  const include = new Set(options.include);
  const ignore = new Set(options.ignore);
  const assignments: Record<string, string> = { [DO_NOT_TRACK.key]: DO_NOT_TRACK.value };
  for (const entry of registry) {
    if (ignore.has(entry.id) || (include.size && !include.has(entry.id))) continue;
    if (entry.kind === "unsupported") continue;
    const { key, value } = entry.env;
    if (Object.hasOwn(assignments, key) && assignments[key] !== value) {
      throw new Error(
        `Conflicting registry assignments for ${key}: ${assignments[key]} and ${value}`,
      );
    }
    assignments[key] = value;
  }
  return { env: { ...inherited, ...assignments }, assignments };
}
