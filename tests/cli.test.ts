import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { expect, test, beforeAll } from "vite-plus/test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(root, "dist", "cli.mjs");

function fixture(pkg: Record<string, unknown>, env?: string): string {
  const dir = join(
    tmpdir(),
    `no-telemetry-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  if (env !== undefined) writeFileSync(join(dir, ".env"), env);
  return dir;
}

function run(
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; input?: string } = { cwd: root },
) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      NO_COLOR: "1",
      // strip host telemetry noise from child
      CI: opts.env?.CI ?? "",
      ...opts.env,
    },
    encoding: "utf8",
    input: opts.input,
  });
}

beforeAll(() => {
  // Ensure dist is built for CLI integration tests
  const built = spawnSync("vp", ["pack"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (built.status !== 0) {
    throw new Error(`build failed:\n${built.stderr}`);
  }
  if (!existsSync(cliPath)) throw new Error(`missing ${cliPath}`);
});

test("cli --version prints version", () => {
  const r = run(["--version"], { cwd: root });
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
});

test("cli --help exits 0", () => {
  const r = run(["--help"], { cwd: root });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("Exit codes:");
});

test("cli doctor --json on next fixture", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["doctor", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.version).toBe(1);
    // macOS may report /var vs /private/var depending on process.cwd()
    expect(realpathSync(json.cwd)).toBe(realpathSync(dir));
    const next = json.libraries.find((l: { id: string }) => l.id === "next");
    expect(next.status).toBe("enabled");
    expect(next.failsCheck).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli check exits 1 when enabled", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["check", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli check exits 0 when disabled", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=1\n");
  try {
    const r = run(["check", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init requires --yes when CI=true", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init"], { cwd: dir, env: { ...process.env, CI: "true" } });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/--yes/);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init -y --json writes .env", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--json"], { cwd: dir, env: { ...process.env, CI: "true" } });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.version).toBe(1);
    expect(json.actions.some((a: { type: string; key?: string }) => a.type === "add")).toBe(true);
    const body = readFileSync(join(dir, ".env"), "utf8");
    expect(body).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(body).toContain("DO_NOT_TRACK=1");

    const check = run(["check", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(check.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --target stdout emits KEY=VAL on stdout", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--target", "stdout"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^NEXT_TELEMETRY_DISABLED=1$/m);
    expect(r.stdout).toMatch(/^DO_NOT_TRACK=1$/m);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --target .env.local", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--target", ".env.local"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, ".env.local"))).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(false);
    const check = run(["check"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(check.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli doctor --only failing", () => {
  const dir = fixture({ dependencies: { next: "15", turbo: "2" } }, "TURBO_TELEMETRY_DISABLED=1\n");
  try {
    const r = run(["doctor", "--json", "--only", "failing"], {
      cwd: dir,
      env: { ...process.env, CI: "" },
    });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.libraries.every((l: { failsCheck: boolean }) => l.failsCheck)).toBe(true);
    expect(json.libraries.some((l: { id: string }) => l.id === "next")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli check --ignore next", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["check", "--json", "--ignore", "next"], {
      cwd: dir,
      env: { ...process.env, CI: "" },
    });
    expect(r.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli missing package.json exits 2", () => {
  const dir = join(tmpdir(), `no-telemetry-empty-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["doctor"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli unknown flag exits 2", () => {
  const r = run(["doctor", "--nope"], { cwd: root });
  expect(r.status).toBe(2);
});

test("cli rejects --ignore on init", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--ignore", "next"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/--ignore/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli rejects --target on doctor", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["doctor", "--target", ".env.local"], {
      cwd: dir,
      env: { ...process.env, CI: "" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/--target/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init error JSON uses ReportV1 with error field", () => {
  const dir = join(tmpdir(), `no-telemetry-empty-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["init", "-y", "--json"], { cwd: dir, env: { ...process.env, CI: "true" } });
    expect(r.status).toBe(2);
    const json = JSON.parse(r.stdout);
    expect(json.version).toBe(1);
    expect(typeof json.error).toBe("string");
    expect(json.summary).toEqual({
      installed: 0,
      applicable: 0,
      disabled: 0,
      enabled: 0,
      unsupported: 0,
      optIn: 0,
      notFound: 0,
    });
    expect(json.libraries).toEqual([]);
    expect(json.actions).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli list --json dumps registry without package.json", () => {
  const dir = join(tmpdir(), `no-telemetry-list-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["list", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.version).toBe(1);
    expect(Array.isArray(json.libraries)).toBe(true);
    expect(json.libraries.length).toBeGreaterThan(10);
    expect(json.libraries.some((l: { id: string }) => l.id === "next")).toBe(true);
    const turbo = json.libraries.find((l: { id: string }) => l.id === "turbo");
    const github = json.libraries.find((l: { id: string }) => l.id === "github-cli");
    expect(turbo.env.alternatePolicy).toBe("or");
    expect(github.env.alternatePolicy).toBe("fallback");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli why next shows env and docs", () => {
  const r = run(["why", "next"], { cwd: root });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("NEXT_TELEMETRY_DISABLED=1");
  expect(r.stdout).toMatch(/nextjs\.org\/telemetry/);
});

test("cli why --json next", () => {
  const r = run(["why", "next", "--json"], { cwd: root });
  expect(r.status).toBe(0);
  const json = JSON.parse(r.stdout);
  expect(json.id).toBe("next");
  expect(json.env.key).toBe("NEXT_TELEMETRY_DISABLED");
  expect(json.docs).toContain("nextjs.org");
});

test("cli why unknown id exits 2", () => {
  const r = run(["why", "not-a-real-lib"], { cwd: root });
  expect(r.status).toBe(2);
});

test("cli why missing id emits compact JSON error", () => {
  const r = run(["why", "--json=compact"], { cwd: root });
  expect(r.status).toBe(2);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim().split("\n")).toHaveLength(1);
  const json = JSON.parse(r.stdout);
  expect(json.version).toBe(1);
  expect(json.error).toMatch(/why <id>/);
});

test("cli why missing id keeps JSON under --quiet", () => {
  const r = run(["why", "--json", "--quiet"], { cwd: root });
  expect(r.status).toBe(2);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(r.stdout).error).toMatch(/why <id>/);
});

test("cli --quiet suppresses runtime diagnostics", () => {
  const dir = join(tmpdir(), `no-telemetry-quiet-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["doctor", "--quiet"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toBe("");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli --quiet suppresses unknown-command diagnostics", () => {
  const r = run(["not-a-command", "--quiet"], { cwd: root });
  expect(r.status).toBe(2);
  expect(r.stderr).toBe("");
  expect(r.stdout).toContain("Usage:");
});

test("cli --json=compact is one line", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=1\n");
  try {
    const r = run(["check", "--json=compact"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines.length).toBe(1);
    const json = JSON.parse(lines[0]!);
    expect(json.version).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli --quiet --json implies compact", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=1\n");
  try {
    const r = run(["check", "--json", "--quiet"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n").length).toBe(1);
    expect(r.stderr.trim()).toBe("");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --example writes .env.example", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--example"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, ".env.example"))).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(false);
    const body = readFileSync(join(dir, ".env.example"), "utf8");
    expect(body).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(body).toMatch(/# no-telemetry \d+\.\d+\.\d+ - /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli check respects turbo via DO_NOT_TRACK only", () => {
  const dir = fixture({ dependencies: { turbo: "2" } }, "DO_NOT_TRACK=1\n");
  try {
    const r = run(["check", "--json"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    const turbo = json.libraries.find((l: { id: string }) => l.id === "turbo");
    expect(turbo?.status).toBe("disabled");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
