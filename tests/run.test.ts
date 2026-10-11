import { expect, test } from "vite-plus/test";
import { buildRunEnv, REGISTRY, matchesOptOut, type RegistryEntry } from "../src/index.ts";

test("run env overrides opt-outs, preserves unrelated values, and leaves parent unchanged", () => {
  const parent = Object.freeze({
    NEXT_TELEMETRY_DISABLED: "0",
    GEMINI_TELEMETRY_ENABLED: "true",
    PATH: "/bin",
    CUSTOM: "keep",
  });
  const result = buildRunEnv(parent);
  expect(result.env.NEXT_TELEMETRY_DISABLED).toBe("1");
  expect(result.env.GEMINI_TELEMETRY_ENABLED).toBe("false");
  expect(result.env.DOTNET_CLI_TELEMETRY_OPTOUT).toBe("1");
  expect(result.env.PATH).toBe("/bin");
  expect(result.env.CUSTOM).toBe("keep");
  expect(result.assignments).not.toHaveProperty("CUSTOM");
  expect(parent.NEXT_TELEMETRY_DISABLED).toBe("0");
});

test("run env includes, excludes, deduplicates, and keeps DO_NOT_TRACK", () => {
  expect(buildRunEnv({}, { include: ["next", "next"] }).assignments).toEqual({
    DO_NOT_TRACK: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  expect(
    buildRunEnv({ NEXT_TELEMETRY_DISABLED: "0" }, { include: ["next"], ignore: ["next"] }).env,
  ).toEqual({ DO_NOT_TRACK: "1", NEXT_TELEMETRY_DISABLED: "0" });
  expect(buildRunEnv({}, { include: ["go"] }).assignments).toEqual({ DO_NOT_TRACK: "1" });
  expect(() => buildRunEnv({}, { include: ["unknown"] })).toThrow("Unknown registry id");
  expect(() => buildRunEnv({}, { ignore: ["unknown"] })).toThrow("Unknown registry id");
});

test("run env rejects contradictory shared assignments before launch", () => {
  const first: RegistryEntry = {
    id: "a",
    name: "A",
    kind: "opt-out",
    packages: [],
    env: { key: "SHARED", value: "1" },
  };
  const second: RegistryEntry = { ...first, id: "b", env: { key: "SHARED", value: "true" } };
  expect(() => buildRunEnv({}, {}, [first, second])).toThrow("Conflicting registry assignments");
  expect(buildRunEnv({}, { ignore: ["b"] }, [first, second]).assignments.SHARED).toBe("1");
  expect(() =>
    buildRunEnv({}, {}, [{ ...first, env: { key: "DO_NOT_TRACK", value: "0" } }]),
  ).toThrow("Conflicting registry assignments");
});

test("registry assignments are compatible and recommended values satisfy their policies", () => {
  const prepared = buildRunEnv({});
  for (const entry of REGISTRY) {
    expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const pkg of entry.packages) expect(pkg).toMatch(/^(?:@[a-z0-9-]+\/)?[a-z0-9*._-]+$/);
    if (entry.kind === "unsupported") continue;
    expect(prepared.assignments[entry.env.key]).toBe(entry.env.value);
    expect(matchesOptOut(entry.env, entry.env.value)).toBe(true);
    if (entry.kind === "opt-in") expect(entry.enableWhen).not.toContain(entry.env.value);
  }
  expect(REGISTRY.find((entry) => entry.id === "meilisearch")?.packages).toEqual([]);
  expect(REGISTRY.find((entry) => entry.id === "azure-cli")?.packages).toEqual([]);
  expect(REGISTRY.find((entry) => entry.id === "sentry-cli")?.kind).toBe("unsupported");
  expect(REGISTRY.find((entry) => entry.id === "yarn")?.kind).toBe("opt-out");
  const kedro = REGISTRY.find((entry) => entry.id === "kedro")!;
  if (kedro.kind !== "unsupported") expect(matchesOptOut(kedro.env, "")).toBe(true);
});

test("registry documents case-insensitive scoped CrewAI opt-outs", () => {
  const entry = REGISTRY.find((entry) => entry.id === "crewai")!;
  if (entry.kind === "unsupported") throw new Error("missing CrewAI control");
  for (const actual of ["true", "TRUE", "YeS", "1", "ON"])
    expect(matchesOptOut(entry.env, actual)).toBe(true);
  for (const actual of ["", "0", "false", "unknown"])
    expect(matchesOptOut(entry.env, actual)).toBe(false);
});
