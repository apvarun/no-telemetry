export type EnvOptOut = {
  key: string;
  value: string;
};

type RegistryBase = {
  /** Stable machine id for JSON, --ignore, and agents (semver-stable). */
  id: string;
  name: string;
  /** package.json names; trailing `/*` matches that scope prefix */
  packages: string[];
  notes?: string;
  /** Official docs / telemetry page used to verify the opt-out (maintainer aid). */
  docs?: string;
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

/**
 * Curated registry — hardcoded, no network.
 *
 * Scope: tools commonly present as direct deps/devDeps in JS/TS projects (2025–2026),
 * plus high-traffic CLIs published on npm. Cross-checked against official docs and
 * (as a research list only) beatcracker/toptout. Prefer high-confidence env-based
 * opt-outs; mark config-only tools `unsupported` rather than inventing vars.
 *
 * Last bulk review: 2026-08-10
 */
export const REGISTRY: RegistryEntry[] = [
  // ── Frameworks & meta-frameworks ─────────────────────────────────────────
  {
    id: "next",
    kind: "opt-out",
    name: "Next.js",
    packages: ["next"],
    env: { key: "NEXT_TELEMETRY_DISABLED", value: "1" },
    docs: "https://nextjs.org/telemetry",
  },
  {
    id: "gatsby",
    kind: "opt-out",
    name: "Gatsby",
    packages: ["gatsby"],
    env: { key: "GATSBY_TELEMETRY_DISABLED", value: "1" },
    docs: "https://www.gatsbyjs.com/docs/telemetry/",
  },
  {
    id: "astro",
    kind: "opt-out",
    name: "Astro",
    packages: ["astro"],
    env: { key: "ASTRO_TELEMETRY_DISABLED", value: "1" },
    docs: "https://docs.astro.build/en/reference/cli-reference/#astro-telemetry",
  },
  {
    id: "nuxt",
    kind: "opt-out",
    name: "Nuxt",
    packages: ["nuxt"],
    env: { key: "NUXT_TELEMETRY_DISABLED", value: "1" },
    docs: "https://nuxt.com/docs/api/commands/telemetry",
  },
  {
    id: "angular",
    kind: "opt-out",
    name: "Angular CLI",
    packages: ["@angular/cli"],
    env: { key: "NG_CLI_ANALYTICS", value: "false" },
    docs: "https://angular.dev/cli/analytics",
  },
  {
    id: "strapi",
    kind: "opt-out",
    name: "Strapi",
    packages: ["@strapi/strapi", "strapi"],
    env: { key: "STRAPI_TELEMETRY_DISABLED", value: "true" },
    docs: "https://docs.strapi.io/cms/configurations/environment",
  },
  {
    id: "create-better-t-stack",
    kind: "opt-out",
    name: "create-better-t-stack",
    packages: ["create-better-t-stack"],
    env: { key: "BTS_TELEMETRY_DISABLED", value: "1" },
  },

  // ── Build / monorepo / DX ────────────────────────────────────────────────
  {
    id: "turbo",
    kind: "opt-out",
    name: "Turborepo",
    packages: ["turbo"],
    env: { key: "TURBO_TELEMETRY_DISABLED", value: "1" },
    docs: "https://turborepo.dev/docs/telemetry",
  },
  {
    id: "storybook",
    kind: "opt-out",
    name: "Storybook",
    packages: ["storybook", "@storybook/*"],
    env: { key: "STORYBOOK_DISABLE_TELEMETRY", value: "1" },
    notes: "Also supports config-file opt-out",
    docs: "https://storybook.js.org/docs/configure/telemetry",
  },
  {
    id: "prisma",
    kind: "opt-out",
    name: "Prisma",
    packages: ["prisma", "@prisma/client"],
    env: { key: "CHECKPOINT_DISABLE", value: "1" },
    notes:
      "May be unreliable in some containerized setups; same key used by HashiCorp Checkpoint tools",
    docs: "https://www.prisma.io/docs/orm/more/under-the-hood/telemetry",
  },
  {
    id: "cdktf",
    kind: "opt-out",
    name: "CDK for Terraform",
    packages: ["cdktf", "cdktf-cli"],
    env: { key: "CHECKPOINT_DISABLE", value: "1" },
    notes: "HashiCorp Checkpoint; shares CHECKPOINT_DISABLE with Prisma and other tools",
    docs: "https://developer.hashicorp.com/terraform/cdktf/telemetry",
  },

  // ── Mobile ───────────────────────────────────────────────────────────────
  {
    id: "expo",
    kind: "opt-out",
    name: "Expo",
    packages: ["expo"],
    env: { key: "EXPO_NO_TELEMETRY", value: "1" },
    docs: "https://docs.expo.dev/more/expo-cli/#telemetry",
  },
  {
    id: "ionic",
    kind: "unsupported",
    name: "Ionic CLI",
    packages: ["@ionic/cli", "ionic"],
    notes: "Config-based: ionic config set -g telemetry false",
    docs: "https://ionicframework.com/docs/cli/configuration#telemetry",
  },
  {
    id: "capacitor",
    kind: "unsupported",
    name: "Capacitor",
    packages: ["@capacitor/cli", "@capacitor/core"],
    notes: "CLI/config: npx cap telemetry off (often opt-in)",
    docs: "https://capacitorjs.com/docs/cli/telemetry",
  },

  // ── Deploy / cloud CLIs (npm) ────────────────────────────────────────────
  {
    id: "vercel",
    kind: "opt-out",
    name: "Vercel CLI",
    packages: ["vercel"],
    env: { key: "VERCEL_TELEMETRY_DISABLED", value: "1" },
    docs: "https://vercel.com/docs/cli/about-telemetry",
  },
  {
    id: "wrangler",
    kind: "opt-out",
    name: "Wrangler",
    packages: ["wrangler"],
    env: { key: "WRANGLER_SEND_METRICS", value: "false" },
    docs: "https://developers.cloudflare.com/workers/wrangler/configuration/",
  },
  {
    id: "railway",
    kind: "opt-out",
    name: "Railway CLI",
    packages: ["railway", "@railway/cli"],
    env: { key: "RAILWAY_NO_TELEMETRY", value: "1" },
    notes: "Also honors DO_NOT_TRACK=1",
    docs: "https://docs.railway.com/cli/telemetry",
  },
  {
    id: "netlify-cli",
    kind: "unsupported",
    name: "Netlify CLI",
    packages: ["netlify-cli"],
    notes: "Config-flag based (netlify --telemetry-disable), not env var",
    docs: "https://docs.netlify.com/cli/get-started/#usage-data-collection",
  },
  {
    id: "aws-amplify-cli",
    kind: "unsupported",
    name: "AWS Amplify CLI",
    packages: ["@aws-amplify/cli"],
    notes: "CLI: amplify configure --usage-data-off",
    docs: "https://docs.amplify.aws/cli/reference/usage-data/",
  },
  {
    id: "aws-cdk",
    kind: "opt-out",
    name: "AWS CDK CLI",
    packages: ["aws-cdk", "aws-cdk-lib"],
    env: { key: "CDK_DISABLE_CLI_TELEMETRY", value: "true" },
    notes: "Matches when aws-cdk or aws-cdk-lib is a direct dependency",
    docs: "https://docs.aws.amazon.com/cdk/v2/guide/cli-telemetry.html",
  },
  {
    id: "serverless",
    kind: "opt-out",
    name: "Serverless Framework",
    packages: ["serverless"],
    env: { key: "SLS_TELEMETRY_DISABLED", value: "1" },
    notes: "Legacy alias SLS_TRACKING_DISABLED also exists; primary is SLS_TELEMETRY_DISABLED",
    docs: "https://www.serverless.com/framework/docs/telemetry/",
  },
  {
    id: "salesforce-cli",
    kind: "opt-out",
    name: "Salesforce CLI",
    packages: ["@salesforce/cli"],
    env: { key: "SF_DISABLE_TELEMETRY", value: "true" },
    docs: "https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_telemetry.htm",
  },
  {
    id: "azure-cli",
    kind: "opt-out",
    name: "Azure CLI",
    packages: ["azure-cli", "@azure/static-web-apps-cli"],
    env: { key: "AZURE_CORE_COLLECT_TELEMETRY", value: "0" },
    notes: "Official az is often system-installed; SWA CLI is common in npm projects",
    docs: "https://learn.microsoft.com/en-us/cli/azure/azure-cli-configuration",
  },
  {
    id: "gcloud",
    kind: "opt-out",
    name: "Google Cloud SDK",
    packages: ["google-cloud-sdk", "@google-cloud/cli"],
    env: { key: "CLOUDSDK_CORE_DISABLE_USAGE_REPORTING", value: "true" },
    notes: "Usually installed outside npm; package names cover rare project pins",
    docs: "https://cloud.google.com/sdk/docs/usage-statistics",
  },

  // ── Data / API platforms ─────────────────────────────────────────────────
  {
    id: "cube",
    kind: "opt-out",
    name: "Cube",
    packages: [
      "@cubejs-backend/server",
      "@cubejs-backend/server-core",
      "@cubejs-backend/cubestore",
    ],
    env: { key: "CUBEJS_TELEMETRY", value: "false" },
    docs: "https://cube.dev/docs/product/configuration/reference/environment-variables",
  },
  {
    id: "hasura",
    kind: "opt-out",
    name: "Hasura CLI / GraphQL Engine",
    packages: ["hasura-cli"],
    env: { key: "HASURA_GRAPHQL_ENABLE_TELEMETRY", value: "false" },
    docs: "https://hasura.io/docs/2.0/policies/telemetry/",
  },

  // ── Observability / tooling CLIs ─────────────────────────────────────────
  {
    id: "sentry-cli",
    kind: "opt-out",
    name: "Sentry CLI",
    packages: ["@sentry/cli"],
    env: { key: "SENTRY_CLI_NO_TELEMETRY", value: "1" },
    notes: "Disables telemetry about the CLI itself, not Sentry product SDKs",
    docs: "https://docs.sentry.io/cli/configuration/",
  },
  {
    id: "hookdeck",
    kind: "opt-out",
    name: "Hookdeck CLI",
    packages: ["hookdeck-cli", "@hookdeck/cli"],
    env: { key: "HOOKDECK_CLI_TELEMETRY_OPTOUT", value: "1" },
  },
  {
    id: "stripe-cli",
    kind: "opt-out",
    name: "Stripe CLI",
    packages: ["@stripe/cli"],
    env: { key: "STRIPE_CLI_TELEMETRY_OPTOUT", value: "1" },
    notes: "CLI only — not the stripe Node SDK package",
    docs: "https://docs.stripe.com/cli/telemetry",
  },
  {
    id: "promptfoo",
    kind: "opt-out",
    name: "Promptfoo",
    packages: ["promptfoo"],
    env: { key: "PROMPTFOO_DISABLE_TELEMETRY", value: "1" },
    docs: "https://www.promptfoo.dev/docs/configuration/telemetry/",
  },

  // ── Backend / BaaS / search ──────────────────────────────────────────────
  {
    id: "supabase",
    kind: "opt-out",
    name: "Supabase CLI",
    packages: ["supabase"],
    env: { key: "SUPABASE_TELEMETRY_DISABLED", value: "1" },
    notes: "Also honors DO_NOT_TRACK=1",
    docs: "https://supabase.com/docs/guides/local-development/cli/getting-started#telemetry",
  },
  {
    id: "meilisearch",
    kind: "opt-out",
    name: "Meilisearch",
    packages: ["meilisearch"],
    env: { key: "MEILI_NO_ANALYTICS", value: "true" },
    docs: "https://www.meilisearch.com/docs/resources/help/telemetry",
  },
  {
    id: "redwood",
    kind: "opt-out",
    name: "RedwoodJS",
    packages: ["@redwoodjs/core", "@redwoodjs/cli", "create-redwood-app"],
    env: { key: "REDWOOD_DISABLE_TELEMETRY", value: "1" },
    docs: "https://telemetry.redwoodjs.com/",
  },
  {
    id: "aws-blocks",
    kind: "opt-out",
    name: "AWS Blocks",
    packages: ["@aws-blocks/blocks", "create-blocks-app", "@aws-blocks/*"],
    env: { key: "AWS_BLOCKS_DISABLE_TELEMETRY", value: "1" },
    notes: "Also disables Blocks-spawned CDK CLI telemetry",
    docs: "https://docs.aws.amazon.com/blocks/latest/devguide/telemetry.html",
  },
  {
    id: "aws-sam-cli",
    kind: "opt-out",
    name: "AWS SAM CLI",
    packages: ["aws-sam-cli", "@aws-sam/cli"],
    env: { key: "SAM_CLI_TELEMETRY", value: "0" },
    notes: "Usually installed via pip/Homebrew/installer, not npm; package names are best-effort",
    docs: "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-telemetry.html",
  },

  // ── AI / agent CLIs ──────────────────────────────────────────────────────
  {
    id: "claude-code",
    kind: "opt-out",
    name: "Claude Code",
    packages: ["@anthropic-ai/claude-code"],
    env: { key: "DISABLE_TELEMETRY", value: "1" },
    notes:
      "Official docs: any non-empty value opts out (we recommend 1). Also honors DO_NOT_TRACK; CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 is broader",
    docs: "https://code.claude.com/docs/en/env-vars",
  },
  {
    id: "gemini-cli",
    kind: "opt-in",
    name: "Gemini CLI",
    packages: ["@google/gemini-cli"],
    env: { key: "GEMINI_TELEMETRY_ENABLED", value: "false" },
    enableWhen: ["1", "true"],
    notes: "OpenTelemetry export is off by default; enableWhen marks explicit on",
    docs: "https://geminicli.com/docs/cli/telemetry/",
  },
  {
    id: "github-cli",
    kind: "opt-out",
    name: "GitHub CLI",
    packages: ["@cli/cli", "gh"],
    env: { key: "GH_TELEMETRY", value: "false" },
    notes:
      "Usually brew/system install; also honors DO_NOT_TRACK. Rare npm package names included for completeness",
    docs: "https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/",
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  {
    id: "better-auth",
    kind: "opt-in",
    name: "Better Auth",
    packages: ["better-auth"],
    env: { key: "BETTER_AUTH_TELEMETRY", value: "0" },
    enableWhen: ["1", "true"],
  },

  // ── Compilers / other ────────────────────────────────────────────────────
  {
    id: "stencil",
    kind: "unsupported",
    name: "Stencil",
    packages: ["@stencil/core"],
    notes: "CLI: npx stencil telemetry off — no documented env-var opt-out",
    docs: "https://stenciljs.com/docs/telemetry",
  },
  {
    id: "flyway",
    kind: "opt-out",
    name: "Flyway (Redgate)",
    packages: ["node-flywaydb", "@flywaydb/flyway-cli", "flyway-cli"],
    env: { key: "REDGATE_DISABLE_TELEMETRY", value: "true" },
    notes: "Any non-empty value disables; package names vary by wrapper",
    docs: "https://documentation.red-gate.com/fd/redgate-disable-telemetry-environment-variable-277579301.html",
  },

  // ── Package managers / other config-only ─────────────────────────────────
  {
    id: "yarn",
    kind: "unsupported",
    name: "Yarn",
    packages: ["yarn"],
    notes: "Yarn 2+ uses .yarnrc.yml enableTelemetry: false — config-based",
    docs: "https://yarnpkg.com/configuration/yarnrc#enableTelemetry",
  },
  {
    id: "firebase-tools",
    kind: "unsupported",
    name: "Firebase CLI",
    packages: ["firebase-tools"],
    notes: "No documented env-var opt-out found; track for config support later",
  },
];

/** Always written by `init` — harmless universal fallback. */
export const DO_NOT_TRACK: EnvOptOut = { key: "DO_NOT_TRACK", value: "1" };
