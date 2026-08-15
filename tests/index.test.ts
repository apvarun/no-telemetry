import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vite-plus/test";
import {
  applyInit,
  buildErrorReport,
  buildReport,
  evaluate,
  failsCheck,
  filterResults,
  parseEnvFile,
  planInit,
  planToActions,
  readDeps,
  resolveEnvBinding,
  scan,
  summarize,
} from "../src/index.ts";
import { REGISTRY } from "../src/registry.ts";
import { shouldUseColor } from "../src/terminal.ts";

function fixture(
  pkg: Record<string, unknown>,
  env?: string,
  extra?: { envLocal?: string },
): string {
  const dir = join(tmpdir(), `no-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  if (env !== undefined) writeFileSync(join(dir, ".env"), env);
  if (extra?.envLocal !== undefined) writeFileSync(join(dir, ".env.local"), extra.envLocal);
  return dir;
}

/** Concrete package name for patterns like `@storybook/*`. */
function installPackage(entry: (typeof REGISTRY)[number]): string {
  const p = entry.packages[0]!;
  return p.endsWith("/*") ? `${p.slice(0, -1)}react` : p;
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
  const next = REGISTRY.find((e) => e.id === "next")!;
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
  expect(r.env[0]?.source).toBe("process-env");
});

test("evaluate: multi-key alsoSatisfiedBy (turbo via DO_NOT_TRACK)", () => {
  const turbo = REGISTRY.find((e) => e.id === "turbo")!;
  expect(turbo.kind).toBe("opt-out");
  if (turbo.kind !== "opt-out") return;
  expect(turbo.alsoSatisfiedBy?.some((e) => e.key === "DO_NOT_TRACK")).toBe(true);

  const viaDnt = evaluate(turbo, new Set(["turbo"]), {}, { DO_NOT_TRACK: "1" });
  expect(viaDnt.status).toBe("disabled");
  expect(failsCheck(viaDnt)).toBe(false);
  expect(viaDnt.detail).toContain("DO_NOT_TRACK");

  const viaPrimary = evaluate(turbo, new Set(["turbo"]), {}, { TURBO_TELEMETRY_DISABLED: "1" });
  expect(viaPrimary.status).toBe("disabled");

  const unset = evaluate(turbo, new Set(["turbo"]), {}, {});
  expect(unset.status).toBe("enabled");
});

test("evaluate: fallback alternates respect GitHub CLI primary precedence", () => {
  const github = REGISTRY.find((e) => e.id === "github-cli")!;
  expect(github.kind).toBe("opt-out");
  if (github.kind !== "opt-out") return;
  expect(github.alternatePolicy).toBe("fallback");

  const primaryEnabled = evaluate(
    github,
    new Set(["gh"]),
    {},
    {
      GH_TELEMETRY: "enabled",
      DO_NOT_TRACK: "1",
    },
  );
  expect(primaryEnabled.status).toBe("enabled");
  expect(failsCheck(primaryEnabled)).toBe(true);

  const primaryDisabled = evaluate(
    github,
    new Set(["gh"]),
    {},
    {
      GH_TELEMETRY: "false",
      DO_NOT_TRACK: "1",
    },
  );
  expect(primaryDisabled.status).toBe("disabled");

  const viaFallback = evaluate(github, new Set(["gh"]), {}, { DO_NOT_TRACK: "true" });
  expect(viaFallback.status).toBe("disabled");
  expect(failsCheck(viaFallback)).toBe(false);
});

test("evaluate: default alternate policy retains OR semantics", () => {
  const turbo = REGISTRY.find((e) => e.id === "turbo")!;
  const result = evaluate(
    turbo,
    new Set(["turbo"]),
    {},
    {
      TURBO_TELEMETRY_DISABLED: "0",
      DO_NOT_TRACK: "1",
    },
  );
  expect(result.status).toBe("disabled");
});

test("shouldUseColor resolves NO_COLOR, FORCE_COLOR, and TTY precedence", () => {
  expect(shouldUseColor(true, {})).toBe(true);
  expect(shouldUseColor(false, {})).toBe(false);
  expect(shouldUseColor(false, { FORCE_COLOR: "1" })).toBe(true);
  expect(shouldUseColor(true, { FORCE_COLOR: "0" })).toBe(false);
  expect(shouldUseColor(true, { NO_COLOR: "1", FORCE_COLOR: "1" })).toBe(false);
  expect(shouldUseColor(true, { NO_COLOR: "" })).toBe(true);
});

test("evaluate: enabled when env missing", () => {
  const next = REGISTRY.find((e) => e.id === "next")!;
  const r = evaluate(next, new Set(["next"]), {}, {});
  expect(r.status).toBe("enabled");
  expect(failsCheck(r)).toBe(true);
  expect(r.env[0]?.source).toBe("unset");
});

test("evaluate: opt-in is not_applicable by default", () => {
  const ba = REGISTRY.find((e) => e.id === "better-auth")!;
  const r = evaluate(ba, new Set(["better-auth"]), {}, {});
  expect(r.status).toBe("not_applicable");
  expect(failsCheck(r)).toBe(false);
});

test("evaluate: opt-in enabled uses enableWhen from registry", () => {
  const ba = REGISTRY.find((e) => e.id === "better-auth")!;
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
  const sb = REGISTRY.find((e) => e.id === "storybook")!;
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
  const n = REGISTRY.find((e) => e.id === "netlify-cli")!;
  const r = evaluate(n, new Set(["netlify-cli"]), {}, {});
  expect(r.status).toBe("unsupported");
  expect(failsCheck(r)).toBe(false);
  expect(n.kind).toBe("unsupported");
});

test("registry kinds and ids are unique and well-formed", () => {
  const ids = new Set<string>();
  expect(REGISTRY.length).toBeGreaterThanOrEqual(12);
  for (const entry of REGISTRY) {
    expect(["opt-out", "opt-in", "unsupported"]).toContain(entry.kind);
    expect(entry.id).toBeTruthy();
    expect(entry.packages.length).toBeGreaterThan(0);
    expect(ids.has(entry.id)).toBe(false);
    ids.add(entry.id);
    if (entry.kind === "opt-out" || entry.kind === "opt-in") {
      expect(entry.env.key).toBeTruthy();
      expect(entry.env.value).toBeTruthy();
    }
    if (entry.kind === "opt-in") {
      expect(entry.enableWhen.length).toBeGreaterThan(0);
    }
  }
});

test("registry: every entry has docs URL", () => {
  const missing = REGISTRY.filter((e) => !e.docs);
  expect(missing.map((e) => e.id)).toEqual([]);
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
    expect(first.path).toContain(".env");

    const plan2 = planInit(dir);
    expect(plan2.every((p) => p.kind === "ok" || p.kind === "conflict")).toBe(true);
    const second = applyInit(dir, plan2);
    expect(second.added).toBe(0);
    expect(second.already).toBeGreaterThan(0);

    const results = scan(dir, {});
    const next = results.find((r) => r.entry.id === "next")!;
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
    const next = results.find((r) => r.entry.id === "next")!;
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
    const next = results.find((r) => r.entry.id === "next")!;
    const ba = results.find((r) => r.entry.id === "better-auth")!;
    const netlify = results.find((r) => r.entry.id === "netlify-cli")!;
    const missing = results.find((r) => r.entry.id === "turbo")!;

    expect(next.status).toBe("enabled");
    expect(ba.status).toBe("not_applicable");
    expect(netlify.status).toBe("unsupported");
    expect(missing.status).toBe("not_found");

    const applicable = results.filter((r) => r.status === "disabled" || r.status === "enabled");
    expect(applicable.every((r) => r.entry.id === "next")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Phase 0 golden fixtures ---

test("golden: every registry entry has correct status matrix", () => {
  for (const entry of REGISTRY) {
    const pkg = installPackage(entry);
    const depsInstalled = new Set([pkg]);
    const depsEmpty = new Set<string>();

    const missing = evaluate(entry, depsEmpty, {}, {});
    expect(missing.status).toBe("not_found");
    expect(failsCheck(missing)).toBe(false);

    if (entry.kind === "unsupported") {
      const inst = evaluate(entry, depsInstalled, {}, {});
      expect(inst.status).toBe("unsupported");
      expect(failsCheck(inst)).toBe(false);
      continue;
    }

    if (entry.kind === "opt-in") {
      const off = evaluate(entry, depsInstalled, {}, {});
      expect(off.status).toBe("not_applicable");
      expect(failsCheck(off)).toBe(false);
      for (const v of entry.enableWhen) {
        const on = evaluate(entry, depsInstalled, {}, { [entry.env.key]: v });
        expect(on.status).toBe("enabled");
        expect(failsCheck(on)).toBe(true);
      }
      const recommended = evaluate(
        entry,
        depsInstalled,
        {},
        {
          [entry.env.key]: entry.env.value,
        },
      );
      expect(recommended.status).toBe("not_applicable");
      continue;
    }

    // opt-out
    const unset = evaluate(entry, depsInstalled, {}, {});
    expect(unset.status).toBe("enabled");
    expect(failsCheck(unset)).toBe(true);

    const disabled = evaluate(entry, depsInstalled, {}, { [entry.env.key]: entry.env.value });
    expect(disabled.status).toBe("disabled");
    expect(failsCheck(disabled)).toBe(false);

    const wrong = evaluate(entry, depsInstalled, {}, { [entry.env.key]: "__WRONG__" });
    expect(wrong.status).toBe("enabled");
    expect(failsCheck(wrong)).toBe(true);

    for (const alt of entry.alsoSatisfiedBy ?? []) {
      const viaAlt = evaluate(entry, depsInstalled, {}, { [alt.key]: alt.value });
      expect(viaAlt.status).toBe("disabled");
      expect(failsCheck(viaAlt)).toBe(false);
    }
  }
});

test("golden: full project all disabled then all enabled", () => {
  const deps: Record<string, string> = {};
  const envLines: string[] = [];
  for (const entry of REGISTRY) {
    deps[installPackage(entry)] = "1";
    if (entry.kind === "opt-out") {
      envLines.push(`${entry.env.key}=${entry.env.value}`);
    }
  }
  const dirOk = fixture({ dependencies: deps }, envLines.join("\n") + "\n");
  const dirBad = fixture({ dependencies: deps });
  try {
    const ok = scan(dirOk, {});
    expect(ok.some(failsCheck)).toBe(false);
    for (const r of ok) {
      if (r.entry.kind === "opt-out") expect(r.status).toBe("disabled");
      if (r.entry.kind === "opt-in") expect(r.status).toBe("not_applicable");
      if (r.entry.kind === "unsupported") expect(r.status).toBe("unsupported");
    }

    const bad = scan(dirBad, {});
    expect(bad.filter(failsCheck).length).toBe(REGISTRY.filter((e) => e.kind === "opt-out").length);
  } finally {
    rmSync(dirOk, { recursive: true, force: true });
    rmSync(dirBad, { recursive: true, force: true });
  }
});

test("golden: prisma dual package names both install", () => {
  const prisma = REGISTRY.find((e) => e.id === "prisma")!;
  for (const pkg of prisma.packages) {
    const r = evaluate(prisma, new Set([pkg]), {}, { CHECKPOINT_DISABLE: "1" });
    expect(r.installed).toBe(true);
    expect(r.status).toBe("disabled");
  }
});

test("golden: empty project plans only DO_NOT_TRACK", () => {
  const dir = fixture({ name: "empty", dependencies: {} });
  try {
    const plan = planInit(dir);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.env.key).toBe("DO_NOT_TRACK");
    expect(plan[0]!.kind).toBe("add");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Phase 1 core ---

test("resolveEnvBinding: process wins over file", () => {
  const b = resolveEnvBinding("FOO", { FOO: "file" }, { FOO: "proc" });
  expect(b.actual).toBe("proc");
  expect(b.source).toBe("process-env");
  const f = resolveEnvBinding("FOO", { FOO: "file" }, {});
  expect(f.actual).toBe("file");
  expect(f.source).toBe("env-file");
});

test("scan merges .env.local over .env", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=0\n", {
    envLocal: "NEXT_TELEMETRY_DISABLED=1\n",
  });
  try {
    const next = scan(dir, {}).find((r) => r.entry.id === "next")!;
    expect(next.status).toBe("disabled");
    expect(next.env[0]?.source).toBe("env-file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planInit + applyInit --target .env.local", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const plan = planInit(dir, { target: ".env.local" });
    const r = applyInit(dir, plan, { target: ".env.local" });
    expect(r.added).toBeGreaterThan(0);
    expect(existsSync(join(dir, ".env"))).toBe(false);
    expect(existsSync(join(dir, ".env.local"))).toBe(true);
    const body = readFileSync(join(dir, ".env.local"), "utf8");
    expect(body).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(scan(dir, {}).find((x) => x.entry.id === "next")!.status).toBe("disabled");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planInit + applyInit --target .env.example", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const plan = planInit(dir, { target: ".env.example" });
    const r = applyInit(dir, plan, { target: ".env.example", version: "0.1.0" });
    expect(r.added).toBeGreaterThan(0);
    expect(existsSync(join(dir, ".env"))).toBe(false);
    const body = readFileSync(join(dir, ".env.example"), "utf8");
    expect(body).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(body).toMatch(/# no-telemetry 0\.1\.0 - /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyInit target stdout does not write files", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const plan = planInit(dir, { target: "stdout" });
    const r = applyInit(dir, plan, { target: "stdout" });
    expect(r.path).toBeNull();
    expect(r.lines.some((l) => l.startsWith("NEXT_TELEMETRY_DISABLED="))).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildReport JSON shape v1", () => {
  const dir = fixture({
    dependencies: { next: "15", "better-auth": "1", "netlify-cli": "1" },
  });
  try {
    const results = scan(dir, {});
    const report = buildReport(dir, results, {
      actions: planToActions(planInit(dir)),
    });
    expect(report.version).toBe(1);
    expect(report.cwd).toBe(dir);
    expect(report.summary.installed).toBe(3);
    expect(report.summary.enabled).toBe(1);
    expect(report.summary.optIn).toBe(1);
    expect(report.summary.unsupported).toBe(1);
    const next = report.libraries.find((l) => l.id === "next")!;
    expect(next.failsCheck).toBe(true);
    expect(next.env[0]?.key).toBe("NEXT_TELEMETRY_DISABLED");
    expect(next.env[0]?.source).toBe("unset");
    expect(report.actions.some((a) => a.type === "add" && a.key === "DO_NOT_TRACK")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("filterResults: only installed / failing / hideNotFound / ignore", () => {
  const dir = fixture({
    dependencies: { next: "15", "netlify-cli": "1" },
  });
  try {
    const results = scan(dir, {});
    expect(
      filterResults(results, { hideNotFound: true }).every((r) => r.status !== "not_found"),
    ).toBe(true);
    expect(filterResults(results, { only: "installed" }).every((r) => r.installed)).toBe(true);
    expect(filterResults(results, { only: "failing" }).every(failsCheck)).toBe(true);
    const ignored = filterResults(results, { ignore: ["next"] });
    expect(ignored.some((r) => r.entry.id === "next")).toBe(false);
    expect(ignored.some((r) => r.entry.id === "netlify-cli")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildErrorReport is version-1 shape with error", () => {
  const report = buildErrorReport("/tmp/x", "No package.json in /tmp/x", {
    actions: [{ type: "message", message: "hint" }],
  });
  expect(report.version).toBe(1);
  expect(report.error).toBe("No package.json in /tmp/x");
  expect(report.summary.installed).toBe(0);
  expect(report.libraries).toEqual([]);
  expect(report.actions).toHaveLength(1);
});

test("summarize matches applicable disabled counts", () => {
  const dir = fixture({ dependencies: { next: "15", turbo: "2" } }, "TURBO_TELEMETRY_DISABLED=1\n");
  try {
    const s = summarize(scan(dir, {}));
    expect(s.applicable).toBe(2);
    expect(s.disabled).toBe(1);
    expect(s.enabled).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
