#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const args = process.argv.slice(2);
const tarballArg = args[0];
const tscFlag = args.indexOf("--tsc");
const tscPath = tscFlag === -1 ? undefined : args[tscFlag + 1];

if (!tarballArg || tarballArg.startsWith("-")) {
  console.error("usage: node scripts/package-smoke.mjs <package.tgz> [--tsc <path>]");
  process.exit(2);
}
if (tscFlag !== -1 && !tscPath) {
  console.error("--tsc requires a path");
  process.exit(2);
}

const tarball = resolve(projectRoot, tarballArg);
if (!existsSync(tarball)) {
  console.error(`package tarball not found: ${tarball}`);
  process.exit(2);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== (options.status ?? 0)) {
    fail(
      [
        `command failed (${result.status}): ${command} ${commandArgs.join(" ")}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function envWithout(...keys) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.has(key)));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const expectedVersion = readJson(join(projectRoot, "package.json")).version;
const tempRoot = mkdtempSync(join(tmpdir(), "no-telemetry-package-smoke-"));
try {
  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify({ name: "no-telemetry-package-smoke", private: true, type: "module" }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball],
    {
      cwd: tempRoot,
      env: { ...process.env, npm_config_cache: join(tempRoot, ".npm-cache") },
    },
  );

  const packageRoot = join(tempRoot, "node_modules", "no-telemetry");
  const packageJson = readJson(join(packageRoot, "package.json"));
  assert(
    packageJson.version === expectedVersion,
    `unexpected package version: ${packageJson.version}`,
  );
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert(
      Object.keys(packageJson[field] ?? {}).length === 0,
      `published package must not have ${field}`,
    );
  }
  assert(
    packageJson.type === "module" &&
      packageJson.exports?.["."]?.import === "./dist/index.mjs" &&
      packageJson.exports?.["."]?.types === "./dist/index.d.mts" &&
      !("require" in packageJson.exports["."]),
    "root export must be explicitly ESM-only with TypeScript declarations",
  );
  assert(
    packageJson.exports?.["./cli"]?.import === "./dist/cli.mjs" &&
      packageJson.exports?.["./cli"]?.types === "./dist/cli.d.mts" &&
      !("require" in packageJson.exports["./cli"]),
    "CLI export must be explicitly ESM-only with TypeScript declarations",
  );

  const expectedTopLevel = [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "dist",
    "package.json",
    "skills",
  ];
  const actualTopLevel = readdirSync(packageRoot).sort();
  assert(
    JSON.stringify(actualTopLevel) === JSON.stringify(expectedTopLevel),
    `unexpected package contents: ${actualTopLevel.join(", ")}`,
  );

  for (const required of [
    "dist/index.mjs",
    "dist/index.d.mts",
    "dist/cli.mjs",
    "dist/cli.d.mts",
    "skills/no-telemetry/SKILL.md",
  ]) {
    assert(existsSync(join(packageRoot, required)), `missing packed file: ${required}`);
  }
  assert(
    readdirSync(join(packageRoot, "dist")).some(
      (file) => file.startsWith("report-") && file.endsWith(".mjs"),
    ),
    "missing bundled report chunk",
  );

  const binTarget = join(packageRoot, packageJson.bin["no-telemetry"]);
  assert(existsSync(binTarget), `missing CLI bin target: ${packageJson.bin["no-telemetry"]}`);
  const cli = (cliArgs, options = {}) =>
    run(process.execPath, [binTarget, ...cliArgs], {
      cwd: options.cwd ?? tempRoot,
      env: options.env ?? process.env,
      status: options.status,
    });

  const version = cli(["--version"]).stdout.trim();
  assert(version === packageJson.version, `CLI version mismatch: ${version}`);

  const list = JSON.parse(cli(["list", "--json=compact"]).stdout);
  assert(list.version === 1 && list.libraries.length === 43, "registry list smoke failed");
  const why = JSON.parse(cli(["why", "next", "--json=compact"]).stdout);
  assert(why.id === "next" && why.env.key === "NEXT_TELEMETRY_DISABLED", "why smoke failed");

  const consumerPath = join(tempRoot, "consumer.mjs");
  writeFileSync(
    consumerPath,
    [
      'import { REGISTRY, planInit, scan } from "no-telemetry";',
      'if (REGISTRY.length !== 43) throw new Error("registry import failed");',
      'if (typeof planInit !== "function" || typeof scan !== "function") throw new Error("API import failed");',
      "",
    ].join("\n"),
  );
  run(process.execPath, [consumerPath], { cwd: tempRoot });

  if (tscPath) {
    const typeConsumerPath = join(tempRoot, "consumer.mts");
    writeFileSync(
      typeConsumerPath,
      [
        'import { REGISTRY, scan, type RegistryEntry } from "no-telemetry";',
        "const entries: RegistryEntry[] = REGISTRY;",
        "void entries;",
        "void scan;",
        "",
      ].join("\n"),
    );
    run(
      resolve(projectRoot, tscPath),
      [
        "--noEmit",
        "--strict",
        "--target",
        "es2022",
        "--module",
        "nodenext",
        "--moduleResolution",
        "nodenext",
        "--types",
        "node",
        "--typeRoots",
        join(projectRoot, "node_modules", "@types"),
        typeConsumerPath,
      ],
      { cwd: tempRoot },
    );
  }

  const fixture = join(tempRoot, "fixture");
  mkdirSync(fixture);
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      dependencies: { next: "15", turbo: "2" },
    }),
  );
  const fixtureEnv = {
    ...envWithout("NEXT_TELEMETRY_DISABLED", "TURBO_TELEMETRY_DISABLED", "DO_NOT_TRACK"),
    CI: "true",
    NO_COLOR: "1",
  };
  cli(["init", "-y", "--json=compact"], { cwd: fixture, env: fixtureEnv });
  const check = JSON.parse(
    cli(["check", "--json=compact"], { cwd: fixture, env: fixtureEnv }).stdout,
  );
  assert(check.summary.enabled === 0, "packed CLI fixture check did not pass");
  const dotenv = readFileSync(join(fixture, ".env"), "utf8");
  for (const line of [
    "NEXT_TELEMETRY_DISABLED=1",
    "TURBO_TELEMETRY_DISABLED=1",
    "DO_NOT_TRACK=1",
  ]) {
    assert(dotenv.includes(line), `fixture .env missing ${line}`);
  }

  console.log(`package smoke passed: ${basename(tarball)} on Node ${process.version}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
