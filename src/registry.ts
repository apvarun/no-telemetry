export type EnvOptOut = {
  key: string;
  value: string;
};

type RegistryBase = {
  name: string;
  /** package.json names; trailing `/*` matches that scope prefix */
  packages: string[];
  notes?: string;
};

/** Telemetry on by default; disable by setting env to `value`. */
export type OptOutEntry = RegistryBase & {
  kind: "opt-out";
  env: EnvOptOut;
};

/**
 * Telemetry off by default; only "enabled" when env is one of `enableWhen`.
 * `env` is the recommended disable assignment (for docs / future init).
 */
export type OptInEntry = RegistryBase & {
  kind: "opt-in";
  env: EnvOptOut;
  /** Process/file values that mean telemetry is ON */
  enableWhen: readonly string[];
};

/** No env-var opt-out in v0.1 (config-file or CLI only). */
export type UnsupportedEntry = RegistryBase & {
  kind: "unsupported";
};

export type RegistryEntry = OptOutEntry | OptInEntry | UnsupportedEntry;

/** Curated v0.1 registry — hardcoded, no network. */
export const REGISTRY: RegistryEntry[] = [
  {
    kind: "opt-out",
    name: "Next.js",
    packages: ["next"],
    env: { key: "NEXT_TELEMETRY_DISABLED", value: "1" },
  },
  {
    kind: "opt-out",
    name: "Prisma",
    packages: ["prisma", "@prisma/client"],
    env: { key: "CHECKPOINT_DISABLE", value: "1" },
    notes: "May be unreliable in some containerized setups",
  },
  {
    kind: "opt-out",
    name: "Turborepo",
    packages: ["turbo"],
    env: { key: "TURBO_TELEMETRY_DISABLED", value: "1" },
  },
  {
    kind: "opt-out",
    name: "Astro",
    packages: ["astro"],
    env: { key: "ASTRO_TELEMETRY_DISABLED", value: "1" },
  },
  {
    kind: "opt-out",
    name: "Nuxt",
    packages: ["nuxt"],
    env: { key: "NUXT_TELEMETRY_DISABLED", value: "1" },
  },
  {
    kind: "opt-out",
    name: "Storybook",
    packages: ["storybook", "@storybook/*"],
    env: { key: "STORYBOOK_DISABLE_TELEMETRY", value: "1" },
    notes: "Also supports config-file opt-out",
  },
  {
    kind: "opt-out",
    name: "Expo",
    packages: ["expo"],
    env: { key: "EXPO_NO_TELEMETRY", value: "1" },
  },
  {
    kind: "opt-out",
    name: "Wrangler",
    packages: ["wrangler"],
    env: { key: "WRANGLER_SEND_METRICS", value: "false" },
  },
  {
    kind: "opt-in",
    name: "Better Auth",
    packages: ["better-auth"],
    env: { key: "BETTER_AUTH_TELEMETRY", value: "0" },
    enableWhen: ["1", "true"],
  },
  {
    kind: "opt-out",
    name: "Gatsby",
    packages: ["gatsby"],
    env: { key: "GATSBY_TELEMETRY_DISABLED", value: "1" },
  },
  {
    kind: "unsupported",
    name: "Netlify CLI",
    packages: ["netlify-cli"],
    notes: "Config-flag based, not env var",
  },
  {
    kind: "opt-out",
    name: "create-better-t-stack",
    packages: ["create-better-t-stack"],
    env: { key: "BTS_TELEMETRY_DISABLED", value: "1" },
  },
];

/** Always written by `init` — harmless universal fallback. */
export const DO_NOT_TRACK: EnvOptOut = { key: "DO_NOT_TRACK", value: "1" };
