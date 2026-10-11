import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
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
    expect(json.summary.enabled).toBe(0);
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

test("cli init --json honors process env over a conflicting target value", () => {
  const dir = fixture({ dependencies: { next: "15" } }, "NEXT_TELEMETRY_DISABLED=0\n");
  try {
    const r = run(["init", "-y", "--json"], {
      cwd: dir,
      env: { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: "1" },
    });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    const next = json.libraries.find((library: { id: string }) => library.id === "next");
    expect(next.status).toBe("disabled");
    expect(next.env[0].source).toBe("process-env");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --example --json reports against the written target", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--example", "--json"], {
      cwd: dir,
      env: { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: undefined },
    });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.summary.enabled).toBe(0);
    expect(json.libraries.find((library: { id: string }) => library.id === "next").status).toBe(
      "disabled",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli init --example fills empty placeholders", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  writeFileSync(join(dir, ".env.example"), "DO_NOT_TRACK=\nNEXT_TELEMETRY_DISABLED=\n");
  try {
    const r = run(["init", "-y", "--example", "--json"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.actions.filter((action: { type: string }) => action.type === "fill")).toHaveLength(
      2,
    );
    const body = readFileSync(join(dir, ".env.example"), "utf8");
    expect(body).toBe("DO_NOT_TRACK=1\nNEXT_TELEMETRY_DISABLED=1\n");
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

test("cli init --target stdout --json reports the projected environment", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--target", "stdout", "--json"], {
      cwd: dir,
      env: { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: undefined },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^NEXT_TELEMETRY_DISABLED=1$/m);
    const json = JSON.parse(r.stderr);
    expect(json.summary.enabled).toBe(0);
    expect(json.libraries.find((library: { id: string }) => library.id === "next").status).toBe(
      "disabled",
    );
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

test("cli init accepts a nested target path", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  mkdirSync(join(dir, "apps", "web"), { recursive: true });
  const target = "apps/web/.env.development";
  try {
    const r = run(["init", "-y", "--target", target], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, target), "utf8")).toContain("NEXT_TELEMETRY_DISABLED=1");
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
    expect(json.summary.applicable).toBe(2);
    expect(json.summary.disabled).toBe(1);
    expect(json.summary.enabled).toBe(1);
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

test("cli ignore matches case, display names, and scoped packages", () => {
  const cases = [
    [{ dependencies: { next: "15" } }, "NEXT"],
    [{ dependencies: { next: "15" } }, "Next.js"],
    [{ dependencies: { "@storybook/react": "8" } }, "@storybook/react"],
  ] as const;
  for (const [pkg, ignored] of cases) {
    const dir = fixture(pkg);
    try {
      const r = run(["check", "--json", "--ignore", ignored], {
        cwd: dir,
        env: { ...process.env, CI: "" },
      });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).summary.ignored).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("cli rejects an unknown --ignore value", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["check", "--ignore", "not-a-library"], { cwd: dir });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Unknown --ignore value: not-a-library");
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

test("cli init --target stdout keeps error JSON off stdout", () => {
  const dir = join(tmpdir(), `no-telemetry-empty-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["init", "-y", "--target", "stdout", "--json"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(JSON.parse(r.stderr).error).toContain("No package.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli reports malformed package.json with its path", () => {
  const dir = fixture({});
  writeFileSync(join(dir, "package.json"), '{"dependencies":');
  try {
    const r = run(["doctor", "--quiet"], { cwd: dir });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(
      `Invalid package.json at ${realpathSync(join(dir, "package.json"))}`,
    );
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
    expect(github.env.alsoSatisfiedBy).toHaveLength(1);
    expect(github.env.alsoSatisfiedBy[0].accepts).toEqual(["1", "true"]);
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

test("cli why resolves scoped package names", () => {
  const r = run(["why", "@storybook/react", "--json"], { cwd: root });
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).id).toBe("storybook");
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

test("cli --quiet still reports fatal errors", () => {
  const dir = join(tmpdir(), `no-telemetry-quiet-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const r = run(["doctor", "--quiet"], { cwd: dir, env: { ...process.env, CI: "" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("No package.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli --quiet still reports unknown commands", () => {
  const r = run(["not-a-command", "--quiet"], { cwd: root });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("Unknown command: not-a-command");
  expect(r.stderr).toContain("Usage:");
  expect(r.stdout).toBe("");
});

test("cli --quiet keeps init results on stdout", () => {
  const dir = fixture({ dependencies: { next: "15" } });
  try {
    const r = run(["init", "-y", "--quiet"], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("vars added");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("cli run works outside a project, preserves arguments and streams, and loads no dotenv", () => {
  const cwd = fixture({});
  rmSync(join(cwd, "package.json"));
  writeFileSync(join(cwd, ".env"), "CUSTOM_FROM_DOTENV=secret\n");
  try {
    const args = ["--help", "--json", "a b", "", "$HOME", "$(echo unsafe)", ";", "--"];
    const result = run(
      [
        "run",
        "--quiet",
        "--",
        process.execPath,
        "-e",
        'process.stdout.write(JSON.stringify({args:process.argv.slice(1),next:process.env.NEXT_TELEMETRY_DISABLED,dnt:process.env.DO_NOT_TRACK,custom:process.env.RUN_TEST_CUSTOM,dotenv:process.env.CUSTOM_FROM_DOTENV,cwd:process.cwd()}));process.stderr.write("child error");',
        "--",
        ...args,
      ],
      {
        cwd,
        env: {
          NEXT_TELEMETRY_DISABLED: "0",
          RUN_TEST_CUSTOM: "keep",
          CUSTOM_FROM_DOTENV: undefined,
        },
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      args,
      next: "1",
      dnt: "1",
      custom: "keep",
      cwd: realpathSync(cwd),
    });
    expect(result.stderr).toBe("child error");
    expect(existsSync(join(cwd, "package.json"))).toBe(false);
    expect(readFileSync(join(cwd, ".env"), "utf8")).toBe("CUSTOM_FROM_DOTENV=secret\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli run forwards stdin and exit codes", () => {
  const result = run(
    [
      "run",
      "--quiet",
      "--",
      process.execPath,
      "-e",
      'process.stdin.pipe(process.stdout);process.stdin.on("end",()=>{process.exitCode=37})',
    ],
    { cwd: root, input: "input bytes\n" },
  );
  expect(result.stdout).toBe("input bytes\n");
  expect(result.status).toBe(37);
});

test("cli run supports selection and exclusions", () => {
  const result = run(
    [
      "run",
      "--include",
      "next",
      "--ignore=next",
      "--quiet",
      "--",
      process.execPath,
      "-e",
      "console.log(process.env.NEXT_TELEMETRY_DISABLED,process.env.DO_NOT_TRACK)",
    ],
    { cwd: root, env: { NEXT_TELEMETRY_DISABLED: "0" } },
  );
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("0 1");
});

test("cli run validates wrapper flags and command before launch", () => {
  for (const args of [
    ["run"],
    ["run", "--"],
    ["run", "node"],
    ["run", "--include", "missing", "--", process.execPath],
    ["run", "--ignore=missing", "--", process.execPath],
    ["run", "--json", "--", process.execPath],
    ["run", "--dry-run", "--", process.execPath],
    ["doctor", "--include", "next"],
  ]) {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  }
  const missing = run(["run", "--quiet", "--", "no-telemetry-nonexistent-command"]);
  expect(missing.status).toBe(2);
  expect(missing.stderr).toContain("ENOENT");
});

test.skipIf(process.platform === "win32")("cli run preserves a child's termination signal", () => {
  const result = run([
    "run",
    "--quiet",
    "--",
    process.execPath,
    "-e",
    'process.kill(process.pid,"SIGTERM")',
  ]);
  expect(result.status).toBeNull();
  expect(result.signal).toBe("SIGTERM");
});

test("cli explains winning file and process overrides without exposing unrelated env", () => {
  const cwd = fixture(
    { dependencies: { next: "1" } },
    "NEXT_TELEMETRY_DISABLED=1\nUNRELATED_SECRET=do-not-show\n",
  );
  writeFileSync(join(cwd, ".env.local"), "NEXT_TELEMETRY_DISABLED=0\n");
  try {
    const human = run(["doctor"], { cwd, env: { NEXT_TELEMETRY_DISABLED: "" } });
    expect(human.stdout).toContain(
      'NEXT_TELEMETRY_DISABLED="" from process-env overrides .env.local="0", .env="1"',
    );
    expect(human.stdout).toContain("Set NEXT_TELEMETRY_DISABLED=1 in process environment");
    expect(human.stdout).not.toContain("UNRELATED_SECRET");
    const json = JSON.parse(
      run(["check", "--json"], { cwd, env: { NEXT_TELEMETRY_DISABLED: undefined } }).stdout,
    );
    const next = json.libraries.find((entry: { id: string }) => entry.id === "next");
    expect(next.env[0]).toMatchObject({
      source: "env-file",
      file: ".env.local",
      actual: "0",
      shadowed: [{ source: "env-file", file: ".env", actual: "1" }],
    });
    expect(json.version).toBe(1);
    const init = run(["init", "--dry-run"], { cwd, env: { NEXT_TELEMETRY_DISABLED: undefined } });
    expect(init.stderr).toContain("this overrides .env");
    const initJson = JSON.parse(
      run(["init", "--dry-run", "--json", "--target", "./.env"], {
        cwd,
        env: { NEXT_TELEMETRY_DISABLED: undefined },
      }).stdout,
    );
    expect(
      initJson.libraries.find((entry: { id: string }) => entry.id === "next").env[0].file,
    ).toBe(".env.local");
    expect(
      initJson.actions.some((action: { message?: string }) =>
        action.message?.includes("this overrides ./.env"),
      ),
    ).toBe(true);
    const custom = join(cwd, "policy.env");
    writeFileSync(custom, "NEXT_TELEMETRY_DISABLED=0\n");
    const conflict = run(["init", "--dry-run", "--target", custom], {
      cwd,
      env: { NEXT_TELEMETRY_DISABLED: undefined },
    });
    expect(conflict.stdout).toContain(`conflict in ${custom}`);
    expect(conflict.stdout).toContain(`Set NEXT_TELEMETRY_DISABLED=1 in ${custom}`);
    const conflictJson = JSON.parse(
      run(["init", "--dry-run", "--json", "--target", custom], { cwd }).stdout,
    );
    expect(
      conflictJson.actions.find((action: { type: string }) => action.type === "conflict").file,
    ).toBe(custom);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")(
  "cli run forwards SIGINT and SIGTERM to a ready child",
  async () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const child = spawn(
        process.execPath,
        [
          cliPath,
          "run",
          "--quiet",
          "--",
          process.execPath,
          "-e",
          `process.on("${signal}",()=>{process.stdout.write("forwarded");process.exit(17)});process.stdout.write("ready");setInterval(()=>{},1000);`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      const outcome = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("child signal timeout"));
        }, 5000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.stdout.on("data", (data) => {
          output += data.toString();
          if (output === "ready") child.kill(signal);
        });
      });
      expect(outcome).toBe(17);
      expect(output).toBe("readyforwarded");
    }
  },
);
