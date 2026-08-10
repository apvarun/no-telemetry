import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vite-plus/test";
import {
  applyInit,
  evaluate,
  failsCheck,
  parseEnvFile,
  planInit,
  readDeps,
  scan,
} from "../src/index.ts";
import { REGISTRY } from "../src/registry.ts";

function fixture(pkg: Record<string, unknown>, env?: string): string {
  const dir = join(tmpdir(), `no-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  if (env !== undefined) writeFileSync(join(dir, ".env"), env);
  return dir;
}

test("parseEnvFile", () => {
  const env = parseEnvFile(`# c\nFOO=1\nBAR="x y"\n`);
  expect(env.FOO).toBe("1");
  expect(env.BAR).toBe("x y");
});

test("readDeps merges dependencies", () => {
  const dir = fixture({
    dependencies: { next: "15" },
    devDependencies: { turbo: "2" },
  });
  try {
    const deps = readDeps(dir);
    expect(deps.has("next")).toBe(true);
    expect(deps.has("turbo")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("evaluate: disabled when env matches", () => {
  const next = REGISTRY.find((e) => e.name === "Next.js")!;
  const r = evaluate(
    next,
    new Set(["next"]),
    {},
    {
      NEXT_TELEMETRY_DISABLED: "1",
    },
  );
  expect(r.status).toBe("disabled");
  expect(failsCheck(r)).toBe(false);
});

test("evaluate: enabled when env missing", () => {
  const next = REGISTRY.find((e) => e.name === "Next.js")!;
  const r = evaluate(next, new Set(["next"]), {}, {});
  expect(r.status).toBe("enabled");
  expect(failsCheck(r)).toBe(true);
});

test("evaluate: opt-in is not_applicable by default", () => {
  const ba = REGISTRY.find((e) => e.name === "Better Auth")!;
  const r = evaluate(ba, new Set(["better-auth"]), {}, {});
  expect(r.status).toBe("not_applicable");
  expect(failsCheck(r)).toBe(false);
});

test("evaluate: opt-in enabled uses enableWhen from registry", () => {
  const ba = REGISTRY.find((e) => e.name === "Better Auth")!;
  expect(ba.kind).toBe("opt-in");
  if (ba.kind !== "opt-in") return;

  const on = evaluate(ba, new Set(["better-auth"]), {}, { BETTER_AUTH_TELEMETRY: "1" });
  expect(on.status).toBe("enabled");
  expect(failsCheck(on)).toBe(true);

  const trueOn = evaluate(ba, new Set(["better-auth"]), {}, { BETTER_AUTH_TELEMETRY: "true" });
  expect(trueOn.status).toBe("enabled");

  const offValue = evaluate(ba, new Set(["better-auth"]), {}, { BETTER_AUTH_TELEMETRY: "0" });
  expect(offValue.status).toBe("not_applicable");
});

test("evaluate: storybook scope match", () => {
  const sb = REGISTRY.find((e) => e.name === "Storybook")!;
  const r = evaluate(
    sb,
    new Set(["@storybook/react"]),
    {},
    {
      STORYBOOK_DISABLE_TELEMETRY: "1",
    },
  );
  expect(r.installed).toBe(true);
  expect(r.status).toBe("disabled");
});

test("evaluate: netlify unsupported", () => {
  const n = REGISTRY.find((e) => e.name === "Netlify CLI")!;
  const r = evaluate(n, new Set(["netlify-cli"]), {}, {});
  expect(r.status).toBe("unsupported");
  expect(failsCheck(r)).toBe(false);
  expect(n.kind).toBe("unsupported");
});

test("registry kinds are exhaustive for v0.1 entries", () => {
  for (const entry of REGISTRY) {
    expect(["opt-out", "opt-in", "unsupported"]).toContain(entry.kind);
    if (entry.kind === "opt-out" || entry.kind === "opt-in") {
      expect(entry.env.key).toBeTruthy();
      expect(entry.env.value).toBeTruthy();
    }
    if (entry.kind === "opt-in") {
      expect(entry.enableWhen.length).toBeGreaterThan(0);
    }
  }
});

test("planInit + applyInit is idempotent", () => {
  const dir = fixture({
    dependencies: { next: "15", turbo: "2" },
  });
  try {
    const plan = planInit(dir);
    const adds = plan.filter((p) => p.kind === "add");
    expect(adds.some((p) => p.env.key === "DO_NOT_TRACK")).toBe(true);
    expect(adds.some((p) => p.env.key === "NEXT_TELEMETRY_DISABLED")).toBe(true);
    expect(adds.some((p) => p.env.key === "TURBO_TELEMETRY_DISABLED")).toBe(true);

    const first = applyInit(dir, plan);
    expect(first.added).toBe(adds.length);

    const plan2 = planInit(dir);
    expect(plan2.every((p) => p.kind === "ok" || p.kind === "conflict")).toBe(true);
    const second = applyInit(dir, plan2);
    expect(second.added).toBe(0);
    expect(second.already).toBeGreaterThan(0);

    const results = scan(dir, {});
    const next = results.find((r) => r.entry.name === "Next.js")!;
    expect(next.status).toBe("disabled");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planInit warns on conflict without overwriting", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=0\n");
  try {
    const plan = planInit(dir);
    const conflict = plan.find(
      (p) => p.kind === "conflict" && p.env.key === "NEXT_TELEMETRY_DISABLED",
    );
    expect(conflict).toBeTruthy();
    applyInit(dir, plan);
    const results = scan(dir, {});
    const next = results.find((r) => r.entry.name === "Next.js")!;
    expect(next.status).toBe("enabled");
    expect(failsCheck(next)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planInit skips opt-in and unsupported entries", () => {
  const dir = fixture({
    dependencies: { "better-auth": "1", "netlify-cli": "17", next: "15" },
  });
  try {
    const plan = planInit(dir);
    const keys = plan.map((p) => p.env.key);
    expect(keys).toContain("NEXT_TELEMETRY_DISABLED");
    expect(keys).toContain("DO_NOT_TRACK");
    expect(keys).not.toContain("BETTER_AUTH_TELEMETRY");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applicable statuses are only disabled|enabled", () => {
  const dir = fixture({
    dependencies: {
      next: "15",
      "better-auth": "1",
      "netlify-cli": "17",
    },
  });
  try {
    const results = scan(dir, {});
    const next = results.find((r) => r.entry.name === "Next.js")!;
    const ba = results.find((r) => r.entry.name === "Better Auth")!;
    const netlify = results.find((r) => r.entry.name === "Netlify CLI")!;
    const missing = results.find((r) => r.entry.name === "Turborepo")!;

    expect(next.status).toBe("enabled");
    expect(ba.status).toBe("not_applicable");
    expect(netlify.status).toBe("unsupported");
    expect(missing.status).toBe("not_found");

    const applicable = results.filter((r) => r.status === "disabled" || r.status === "enabled");
    expect(applicable.every((r) => r.entry.name === "Next.js")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
