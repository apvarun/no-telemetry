export type EnvOptOut = {
  key: string;
  /** Recommended value written by init. */
  value: string;
  /** Values that satisfy the opt-out. Defaults to an exact match with `value`. */
  accepts?: readonly string[] | "non-empty" | "set";
  /** Compare listed accepted values without case sensitivity, when documented. */
  caseInsensitive?: boolean;
};

type RegistryBase = {
  /** Stable machine id for JSON, --ignore, and agents (semver-stable). */
  id: string;
  name: string;
  ecosystem?: string;
  /** Date the entry was checked against its official docs or upstream source. */
  verifiedAt?: string;
  /** package.json names; trailing `/*` matches that scope prefix */
  packages: string[];
  notes?: string;
  /** Official docs / telemetry page used to verify the opt-out (maintainer aid). */
  docs?: string;
};

/** Telemetry on by default; disable by setting env to `value`. */
export type OptOutEntry = RegistryBase & {
  kind: "opt-out";
  /** Primary opt-out - what `init` writes. */
  env: EnvOptOut;
  /**
   * Additional env signals that also count as disabled (OR with `env` by default).
   * Example: Turbo honors `TURBO_TELEMETRY_DISABLED=1` *or* `DO_NOT_TRACK=1`.
   * Init still only writes primary `env` (+ global DO_NOT_TRACK).
   */
  alsoSatisfiedBy?: EnvOptOut[];
  /** `fallback` consults alternate signals only when the primary key is unset. Default `or`. */
  alternatePolicy?: "or" | "fallback";
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

/** No verified env-var opt-out (config/CLI only or control not verified). */
export type UnsupportedEntry = RegistryBase & {
  kind: "unsupported";
};

export type RegistryEntry = OptOutEntry | OptInEntry | UnsupportedEntry;

/**
 * Curated registry - hardcoded, no network.
 *
 * Scope: tools commonly present as direct deps/devDeps in JS/TS projects (2025–2026),
 * plus high-traffic CLIs published on npm. Cross-checked against official docs and
 * (as a research list only) beatcracker/toptout. Prefer high-confidence env-based
 * opt-outs; mark config-only tools `unsupported` rather than inventing vars.
 *
 * Last bulk review: 2026-10-11. Evidence and limits: REGISTRY-COVERAGE.md.
 */
export const REGISTRY: RegistryEntry[] = [
  // ── Frameworks & meta-frameworks ─────────────────────────────────────────
  {
    id: "next",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Next.js",
    packages: ["next"],
    env: { key: "NEXT_TELEMETRY_DISABLED", value: "1" },
    docs: "https://nextjs.org/telemetry",
  },
  {
    id: "gatsby",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Gatsby",
    packages: ["gatsby"],
    env: { key: "GATSBY_TELEMETRY_DISABLED", value: "1" },
    docs: "https://www.gatsbyjs.com/docs/telemetry/",
  },
  {
    id: "astro",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Astro",
    packages: ["astro"],
    env: { key: "ASTRO_TELEMETRY_DISABLED", value: "1" },
    docs: "https://docs.astro.build/en/reference/cli-reference/#astro-telemetry",
  },
  {
    id: "nuxt",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Nuxt",
    packages: ["nuxt"],
    env: { key: "NUXT_TELEMETRY_DISABLED", value: "1" },
    docs: "https://github.com/nuxt/telemetry",
  },
  {
    id: "angular",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Angular CLI",
    packages: ["@angular/cli"],
    env: { key: "NG_CLI_ANALYTICS", value: "false", accepts: ["false", "0"] },
    docs: "https://angular.dev/cli/analytics",
  },
  {
    id: "strapi",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Strapi",
    packages: ["@strapi/strapi", "strapi"],
    env: { key: "STRAPI_TELEMETRY_DISABLED", value: "true" },
    docs: "https://docs.strapi.io/cms/configurations/environment",
  },
  {
    id: "create-better-t-stack",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "create-better-t-stack",
    packages: ["create-better-t-stack"],
    env: { key: "BTS_TELEMETRY_DISABLED", value: "1" },
    docs: "https://github.com/AmanVarshney01/create-better-t-stack/blob/main/apps/cli/src/utils/telemetry.ts",
  },

  // ── Build / monorepo / DX ────────────────────────────────────────────────
  {
    id: "turbo",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Turborepo",
    packages: ["turbo"],
    env: { key: "TURBO_TELEMETRY_DISABLED", value: "1" },
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1" }],
    notes: "Also disabled when DO_NOT_TRACK=1",
    docs: "https://turborepo.dev/docs/telemetry",
  },
  {
    id: "storybook",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Storybook",
    packages: ["storybook", "@storybook/*"],
    env: { key: "STORYBOOK_DISABLE_TELEMETRY", value: "1" },
    notes: "Also supports config-file opt-out",
    docs: "https://storybook.js.org/docs/configure/telemetry",
  },
  {
    id: "prisma",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Prisma",
    packages: ["prisma"],
    env: { key: "CHECKPOINT_DISABLE", value: "1", accepts: "non-empty" },
    notes:
      "Prisma ORM CLI 6.x/7.x Checkpoint requests only, not application query observability in @prisma/client. Prisma 8 uses the separate prisma-8 entry.",
    docs: "https://github.com/prisma/prisma/blob/7.8.0/packages/cli/src/utils/checkpoint.ts",
  },
  {
    id: "cdktf",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "CDK for Terraform",
    packages: ["cdktf-cli"],
    env: { key: "CHECKPOINT_DISABLE", value: "1", accepts: "non-empty" },
    notes: "CDKTF CLI Checkpoint only; shares CHECKPOINT_DISABLE with other Checkpoint clients.",
    docs: "https://developer.hashicorp.com/terraform/cdktf/telemetry",
  },

  // ── Mobile ───────────────────────────────────────────────────────────────
  {
    id: "expo",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Expo",
    packages: ["expo"],
    env: { key: "EXPO_NO_TELEMETRY", value: "1" },
    docs: "https://docs.expo.dev/more/expo-cli/#telemetry",
  },
  {
    id: "ionic",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Ionic CLI",
    packages: ["@ionic/cli", "ionic"],
    notes: "Config-based: ionic config set -g telemetry false",
    docs: "https://ionicframework.com/docs/cli/configuration#telemetry",
  },
  {
    id: "capacitor",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Capacitor",
    packages: ["@capacitor/cli"],
    notes: "CLI/config: npx cap telemetry off (often opt-in)",
    docs: "https://capacitorjs.com/docs/cli/telemetry",
  },

  // ── Deploy / cloud CLIs (npm) ────────────────────────────────────────────
  {
    id: "vercel",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Vercel CLI",
    packages: ["vercel"],
    env: { key: "VERCEL_TELEMETRY_DISABLED", value: "1" },
    docs: "https://vercel.com/docs/cli/about-telemetry",
  },
  {
    id: "wrangler",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Wrangler",
    packages: ["wrangler"],
    env: { key: "WRANGLER_SEND_METRICS", value: "false" },
    docs: "https://developers.cloudflare.com/workers/wrangler/system-environment-variables/",
  },
  {
    id: "railway",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "go",
    name: "Railway CLI",
    packages: ["@railway/cli"],
    env: { key: "RAILWAY_NO_TELEMETRY", value: "1" },
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1" }],
    notes: "Also disabled when DO_NOT_TRACK=1",
    docs: "https://docs.railway.com/cli/telemetry",
  },
  {
    id: "netlify-cli",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Netlify CLI",
    packages: ["netlify-cli"],
    notes: "Config-flag based (netlify --telemetry-disable), not env var",
    docs: "https://docs.netlify.com/cli/get-started/#usage-data-collection",
  },
  {
    id: "aws-amplify-cli",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "AWS Amplify CLI",
    packages: ["@aws-amplify/cli"],
    notes: "CLI: amplify configure --usage-data-off",
    docs: "https://docs.amplify.aws/gen1/javascript/tools/cli/reference/usage-data/",
  },
  {
    id: "aws-cdk",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "AWS CDK CLI",
    packages: ["aws-cdk"],
    env: { key: "CDK_DISABLE_CLI_TELEMETRY", value: "true" },
    notes:
      "CDK CLI telemetry only; CloudFormation application usage reporting is separate. --no-version-reporting disables both for a command.",
    docs: "https://docs.aws.amazon.com/cdk/v2/guide/cli-telemetry.html",
  },
  {
    id: "serverless",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Serverless Framework",
    packages: ["serverless"],
    env: { key: "SLS_TELEMETRY_DISABLED", value: "1" },
    notes: "Legacy alias SLS_TRACKING_DISABLED also exists; primary is SLS_TELEMETRY_DISABLED",
    docs: "https://www.serverless.com/framework/docs/telemetry/",
  },
  {
    id: "salesforce-cli",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Salesforce CLI",
    packages: ["@salesforce/cli"],
    env: { key: "SF_DISABLE_TELEMETRY", value: "true" },
    docs: "https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_telemetry.htm",
  },
  {
    id: "azure-cli",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "python",
    name: "Azure CLI",
    packages: [],
    env: { key: "AZURE_CORE_COLLECT_TELEMETRY", value: "0" },
    notes:
      "Controls system-installed az only, not the Static Web Apps CLI. Use run --include azure-cli -- az ... .",
    docs: "https://learn.microsoft.com/en-us/cli/azure/azure-cli-configuration",
  },
  {
    id: "gcloud",
    kind: "opt-in",
    verifiedAt: "2026-10-11",
    enableWhen: ["false", "0"],
    ecosystem: "python",
    name: "Google Cloud SDK",
    packages: [],
    env: { key: "CLOUDSDK_CORE_DISABLE_USAGE_REPORTING", value: "true" },
    notes:
      "Google Cloud CLI usage reporting is opt-in at installation. Environment opt-in checks only; saved config is not inspected. Use run --include gcloud -- gcloud ... .",
    docs: "https://cloud.google.com/sdk/docs/usage-statistics",
  },

  // ── Data / API platforms ─────────────────────────────────────────────────
  {
    id: "cube",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Cube",
    packages: ["@cubejs-backend/server", "@cubejs-backend/server-core"],
    env: { key: "CUBEJS_TELEMETRY", value: "false" },
    docs: "https://cube.dev/docs/product/configuration/reference/environment-variables",
  },
  {
    id: "hasura",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "go",
    name: "Hasura CLI / GraphQL Engine",
    packages: ["hasura-cli"],
    env: { key: "HASURA_GRAPHQL_ENABLE_TELEMETRY", value: "false" },
    docs: "https://hasura.io/docs/2.0/policies/telemetry/",
  },

  // ── Observability / tooling CLIs ─────────────────────────────────────────
  {
    id: "sentry-cli",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Sentry CLI",
    packages: ["@sentry/cli"],
    notes:
      "No verified SENTRY_CLI_NO_TELEMETRY control in upstream sentry-cli. Do not confuse CLI API operations with build-plugin or product SDK telemetry.",
    docs: "https://github.com/getsentry/sentry-cli/blob/master/src/config.rs",
  },
  {
    id: "hookdeck",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "go",
    name: "Hookdeck CLI",
    packages: ["hookdeck-cli"],
    env: {
      key: "HOOKDECK_CLI_TELEMETRY_DISABLED",
      value: "1",
      accepts: ["1", "true"],
    },
    notes: "Also accepts true; CLI: hookdeck telemetry disabled",
    docs: "https://github.com/hookdeck/hookdeck-cli#telemetry",
  },
  {
    id: "stripe-cli",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "go",
    name: "Stripe CLI",
    packages: [],
    env: { key: "STRIPE_CLI_TELEMETRY_OPTOUT", value: "1", accepts: ["1", "true"] },
    notes:
      "Controls the Stripe CLI itself, not the stripe Node SDK. No verified npm package match.",
    docs: "https://docs.stripe.com/cli/telemetry",
  },
  {
    id: "promptfoo",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Promptfoo",
    packages: ["promptfoo"],
    env: { key: "PROMPTFOO_DISABLE_TELEMETRY", value: "1" },
    docs: "https://www.promptfoo.dev/docs/configuration/telemetry/",
  },

  // ── Backend / BaaS / search ──────────────────────────────────────────────
  {
    id: "supabase",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Supabase CLI",
    packages: ["supabase"],
    env: { key: "SUPABASE_TELEMETRY_DISABLED", value: "1" },
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1" }],
    notes: "Also disabled when DO_NOT_TRACK=1",
    docs: "https://supabase.com/docs/guides/local-development/cli/getting-started#telemetry",
  },
  {
    id: "meilisearch",
    kind: "opt-out",
    ecosystem: "rust",
    verifiedAt: "2026-10-11",
    name: "Meilisearch",
    packages: [],
    env: { key: "MEILI_NO_ANALYTICS", value: "true" },
    notes:
      "Controls the Meilisearch server process. The meilisearch npm client does not launch or configure that server.",
    docs: "https://www.meilisearch.com/docs/resources/help/telemetry",
  },
  {
    id: "redwood",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "RedwoodJS",
    packages: ["@redwoodjs/core", "@redwoodjs/cli", "create-redwood-app"],
    env: { key: "REDWOOD_DISABLE_TELEMETRY", value: "1" },
    docs: "https://telemetry.redwoodjs.com/",
  },
  {
    id: "aws-blocks",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "AWS Blocks",
    packages: ["@aws-blocks/blocks", "create-blocks-app"],
    env: { key: "AWS_BLOCKS_DISABLE_TELEMETRY", value: "1" },
    notes: "Also disables Blocks-spawned CDK CLI telemetry",
    docs: "https://docs.aws.amazon.com/blocks/latest/devguide/telemetry.html",
  },
  {
    id: "aws-sam-cli",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "python",
    name: "AWS SAM CLI",
    packages: [],
    env: { key: "SAM_CLI_TELEMETRY", value: "0" },
    notes: "Controls the system/Python-installed SAM CLI, not an npm SDK.",
    docs: "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-telemetry.html",
  },

  // ── AI / agent CLIs ──────────────────────────────────────────────────────
  {
    id: "claude-code",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Claude Code",
    packages: ["@anthropic-ai/claude-code"],
    env: { key: "DISABLE_TELEMETRY", value: "1", accepts: "non-empty" },
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1" }],
    notes:
      "Official docs: any non-empty value opts out (we recommend 1). Also honors DO_NOT_TRACK; CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 is broader",
    docs: "https://code.claude.com/docs/en/env-vars",
  },
  {
    id: "gemini-cli",
    kind: "opt-in",
    verifiedAt: "2026-10-11",
    name: "Gemini CLI",
    packages: ["@google/gemini-cli"],
    env: { key: "GEMINI_TELEMETRY_ENABLED", value: "false" },
    enableWhen: ["1", "true"],
    notes:
      "Controls opt-in OpenTelemetry export; settings files can also enable export and are not inspected by doctor/check.",
    docs: "https://geminicli.com/docs/cli/telemetry/",
  },
  {
    id: "github-cli",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    ecosystem: "go",
    name: "GitHub CLI",
    packages: [],
    env: { key: "GH_TELEMETRY", value: "false" },
    // Docs show DO_NOT_TRACK=true; 1 is the Console DNT convention we write via init.
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1", accepts: ["1", "true"] }],
    alternatePolicy: "fallback",
    notes:
      "GitHub CLI v2.91.0+; controls gh itself, not Copilot or extensions. GH_TELEMETRY takes precedence over DO_NOT_TRACK.",
    docs: "https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/",
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  {
    id: "better-auth",
    kind: "opt-in",
    verifiedAt: "2026-10-11",
    name: "Better Auth",
    packages: ["better-auth"],
    env: { key: "BETTER_AUTH_TELEMETRY", value: "0" },
    enableWhen: ["1", "true"],
    notes:
      "Environment opt-in checks only; telemetry can also be enabled in auth configuration, which is not inspected.",
    docs: "https://www.better-auth.com/docs/reference/telemetry",
  },

  // ── Compilers / other ────────────────────────────────────────────────────
  {
    id: "stencil",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Stencil",
    packages: ["@stencil/core"],
    notes: "CLI: npx stencil telemetry off - no documented env-var opt-out",
    docs: "https://stenciljs.com/docs/telemetry",
  },
  {
    id: "flyway",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Flyway (Redgate)",
    packages: [],
    env: { key: "REDGATE_DISABLE_TELEMETRY", value: "true", accepts: "non-empty" },
    notes:
      "Controls Flyway and Flyway Desktop; any non-empty value disables telemetry. No verified npm wrapper match.",
    docs: "https://documentation.red-gate.com/fd/redgate-disable-telemetry-environment-variable-277579301.html",
  },

  // ── Package managers / other config-only ─────────────────────────────────
  {
    id: "yarn",
    kind: "opt-out",
    verifiedAt: "2026-10-11",
    name: "Yarn",
    env: { key: "YARN_ENABLE_TELEMETRY", value: "0", accepts: ["0", "false"] },
    packages: ["yarn"],
    notes:
      "Yarn 2+ scalar config supports environment overrides. Yarn Classic does not use this telemetry setting.",
    docs: "https://yarnpkg.com/configuration/yarnrc#enableTelemetry",
  },
  {
    id: "firebase-tools",
    kind: "unsupported",
    verifiedAt: "2026-10-11",
    name: "Firebase CLI",
    packages: ["firebase-tools"],
    notes:
      "Usage collection is opt-in in saved CLI state. Run firebase logout, then firebase login and decline the usage-data prompt; config state is not inspected.",
    docs: "https://github.com/firebase/firebase-tools/blob/master/src/commands/login.ts",
  },
  // Cross-ecosystem tools: run/list/why coverage; no non-npm manifest detection.
  {
    id: "dotnet",
    kind: "opt-out",
    name: ".NET SDK",
    ecosystem: "dotnet",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "DOTNET_CLI_TELEMETRY_OPTOUT",
      value: "1",
      accepts: ["1", "true"],
    },
    notes:
      "Controls .NET SDK/CLI usage collection; set before installation to opt out of the installer event too.",
    docs: "https://learn.microsoft.com/dotnet/core/tools/telemetry",
  },
  {
    id: "huggingface-hub",
    kind: "opt-out",
    name: "Hugging Face Hub",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "HF_HUB_DISABLE_TELEMETRY",
      value: "1",
    },
    alsoSatisfiedBy: [
      {
        key: "DO_NOT_TRACK",
        value: "1",
      },
    ],
    notes:
      "Controls telemetry sent through huggingface_hub and hf_xet; does not block ordinary Hub API or model downloads.",
    docs: "https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables",
  },
  {
    id: "prefect",
    kind: "opt-out",
    name: "Prefect server",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "PREFECT_SERVER_ANALYTICS_ENABLED",
      value: "false",
    },
    notes: "Self-hosted Prefect server analytics only; does not disable Prefect Cloud operations.",
    docs: "https://reference.prefect.io/prefect/server/services/telemetry/",
  },
  {
    id: "posthog-wizard",
    kind: "opt-out",
    name: "PostHog Wizard",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["@posthog/wizard"],
    env: {
      key: "POSTHOG_WIZARD_NO_TELEMETRY",
      value: "1",
    },
    notes:
      "Setup wizard run-state telemetry only; does not disable analytics SDKs added to the application.",
    docs: "https://github.com/PostHog/wizard/blob/main/README.md",
  },
  {
    id: "chroma",
    kind: "opt-out",
    name: "Chroma Python",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "ANONYMIZED_TELEMETRY",
      value: "false",
    },
    notes:
      "Python client/server Settings product telemetry. The chromadb npm client is not a verified match for server configuration.",
    docs: "https://cookbook.chromadb.dev/core/configuration/",
  },
  {
    id: "dagster",
    kind: "unsupported",
    name: "Dagster",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Set telemetry.enabled: false in $DAGSTER_HOME/dagster.yaml. No documented environment opt-out; configuration is not modified.",
    docs: "https://dagster.io/docs/about/telemetry",
  },
  {
    id: "streamlit",
    kind: "opt-out",
    env: { key: "STREAMLIT_BROWSER_GATHER_USAGE_STATS", value: "false" },
    name: "Streamlit",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Streamlit CLI maps browser.gatherUsageStats to this environment variable. An explicit --browser.gatherUsageStats flag takes precedence.",
    docs: "https://docs.streamlit.io/develop/api-reference/configuration/config.toml",
  },
  {
    id: "gradio",
    kind: "opt-out",
    name: "Gradio",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "GRADIO_ANALYTICS_ENABLED",
      value: "False",
    },
    notes:
      "Default analytics preference; an explicit analytics_enabled constructor argument can override it. Does not control the @gradio/client npm SDK.",
    docs: "https://gradio.app/4.44.1/guides/sharing-your-app",
  },
  {
    id: "dvc",
    kind: "opt-out",
    name: "DVC",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "DVC_NO_ANALYTICS",
      value: "1",
    },
    notes: "Environment opt-out overrides core.analytics configuration.",
    docs: "https://doc.dvc.org/user-guide/analytics",
  },
  {
    id: "dbt-core",
    kind: "opt-out",
    name: "dbt Core 1.x",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "DBT_SEND_ANONYMOUS_USAGE_STATS",
      value: "false",
    },
    notes:
      "dbt Core Python CLI 1.x; dbt v2 uses a separate variable. Explicit command-line flags can override environment defaults.",
    docs: "https://github.com/dbt-labs/dbt-core/blob/1.10.latest/core/dbt/cli/params.py",
  },
  {
    id: "dbt-engine",
    kind: "opt-out",
    name: "dbt v2 engine",
    ecosystem: "rust",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "DBT_ENGINE_SEND_ANONYMOUS_USAGE_STATS",
      value: "false",
    },
    alsoSatisfiedBy: [
      {
        key: "DO_NOT_TRACK",
        value: "1",
      },
    ],
    notes: "dbt v2.0+ Rust engine; separate from the dbt Core 1.x Python CLI.",
    docs: "https://docs.getdbt.com/reference/global-configs/usage-stats",
  },
  {
    id: "sqlmesh",
    kind: "opt-out",
    name: "SQLMesh",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "SQLMESH__DISABLE_ANONYMIZED_ANALYTICS",
      value: "1",
      accepts: ["1", "true", "t", "yes", "y"],
    },
    docs: "https://sqlmesh.readthedocs.io/en/stable/reference/configuration/",
  },
  {
    id: "meltano",
    kind: "opt-out",
    name: "Meltano",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "MELTANO_SEND_ANONYMOUS_USAGE_STATS",
      value: "false",
    },
    notes: "Meltano usage tracking; does not control telemetry in invoked third-party connectors.",
    docs: "https://docs.meltano.com/reference/settings",
  },
  {
    id: "homebrew",
    kind: "opt-out",
    name: "Homebrew",
    ecosystem: "ruby",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "HOMEBREW_NO_ANALYTICS",
      value: "1",
    },
    docs: "https://docs.brew.sh/Analytics",
  },
  {
    id: "terraform",
    kind: "opt-out",
    name: "Terraform Checkpoint",
    ecosystem: "go",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "CHECKPOINT_DISABLE",
      value: "1",
      accepts: "non-empty",
    },
    notes:
      "Checkpoint version/security requests only; does not block providers, registry downloads, or HCP operations.",
    docs: "https://github.com/hashicorp/go-checkpoint",
  },
  {
    id: "packer",
    kind: "opt-out",
    name: "Packer Checkpoint",
    ecosystem: "go",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "CHECKPOINT_DISABLE",
      value: "1",
      accepts: "non-empty",
    },
    notes:
      "Checkpoint requests only; does not block plugin downloads or infrastructure operations.",
    docs: "https://github.com/hashicorp/go-checkpoint",
  },
  {
    id: "go",
    kind: "unsupported",
    name: "Go toolchain",
    ecosystem: "go",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Run go telemetry off. GOTELEMETRY is a read-only observation, not an environment override. Local collection is the default; upload is opt-in.",
    docs: "https://go.dev/doc/telemetry",
  },
  {
    id: "bentoml",
    kind: "opt-out",
    name: "BentoML",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "BENTOML_DO_NOT_TRACK",
      value: "1",
    },
    notes: "CLI usage analytics; environment default for --do-not-track.",
    docs: "https://docs.bentoml.org/en/latest/reference/bentoml/cli.html",
  },
  {
    id: "n8n",
    kind: "opt-out",
    name: "n8n",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["n8n"],
    env: {
      key: "N8N_DIAGNOSTICS_ENABLED",
      value: "false",
    },
    notes:
      "Anonymous diagnostics only. Disabling also prevents Ask AI in the Code node; version checks and template requests are separate.",
    docs: "https://docs.n8n.io/hosting/configuration/environment-variables/deployment/",
  },
  {
    id: "dlt",
    kind: "unsupported",
    name: "dlt",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Run dlt --disable-telemetry, or set runtime.dlthub_telemetry=false in .dlt/config.toml. No environment assignment is injected.",
    docs: "https://dlthub.com/docs/reference/telemetry",
  },
  {
    id: "medusa",
    kind: "opt-out",
    name: "Medusa CLI",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["@medusajs/cli"],
    env: {
      key: "MEDUSA_DISABLE_TELEMETRY",
      value: "true",
    },
    notes: "CLI application analytics only; Medusa Admin analytics uses a separate control.",
    docs: "https://docs.medusajs.com/learn/resources/usage",
  },
  {
    id: "medusa-admin",
    kind: "opt-out",
    name: "Medusa Admin",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "MEDUSA_FF_ANALYTICS",
      value: "false",
    },
    notes:
      "Admin build analytics preference, separate from MEDUSA_DISABLE_TELEMETRY. Apply in the process building the admin.",
    docs: "https://docs.medusajs.com/learn/resources/usage",
  },
  {
    id: "directus",
    kind: "opt-out",
    name: "Directus server",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["directus"],
    env: {
      key: "TELEMETRY",
      value: "false",
    },
    notes:
      "Directus server environment telemetry. Does not control @directus/sdk clients; generic variable name may affect other tools when injected.",
    docs: "https://docs.directus.io/self-hosted/config-options",
  },
  {
    id: "ray",
    kind: "opt-out",
    name: "Ray clusters",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "RAY_USAGE_STATS_ENABLED",
      value: "0",
    },
    notes:
      "Apply before starting a cluster. Does not change telemetry for already running clusters; ray.init local development differs.",
    docs: "https://docs.ray.io/en/latest/cluster/usage-stats.html",
  },
  {
    id: "vllm",
    kind: "opt-out",
    name: "vLLM",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "VLLM_NO_USAGE_STATS",
      value: "1",
    },
    notes: "vLLM usage statistics only; does not disable application-serving requests.",
    docs: "https://docs.vllm.ai/en/stable/configuration/env_vars/",
  },
  {
    id: "kedro",
    kind: "opt-out",
    name: "Kedro telemetry",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "KEDRO_DISABLE_TELEMETRY",
      value: "1",
      accepts: "set",
    },
    alsoSatisfiedBy: [
      {
        key: "DO_NOT_TRACK",
        value: "1",
        accepts: "set",
      },
    ],
    notes: "kedro-telemetry plugin checks variable presence, including an empty value.",
    docs: "https://docs.kedro.org/en/stable/about/telemetry/",
  },
  {
    id: "rasa",
    kind: "opt-out",
    name: "Rasa Open Source",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "RASA_TELEMETRY_ENABLED",
      value: "false",
    },
    notes: "Rasa Open Source telemetry; does not cover separately deployed Rasa products.",
    docs: "https://legacy-docs-oss.rasa.com/docs/rasa/telemetry/telemetry/",
  },
  {
    id: "fastlane",
    kind: "opt-out",
    name: "fastlane",
    ecosystem: "ruby",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "FASTLANE_OPT_OUT_USAGE",
      value: "1",
    },
    docs: "https://docs.fastlane.tools/#metrics",
  },
  {
    id: "tilt",
    kind: "opt-out",
    name: "Tilt",
    ecosystem: "go",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "TILT_DISABLE_ANALYTICS",
      value: "true",
    },
    docs: "https://docs.tilt.dev/telemetry_faq.html",
  },
  {
    id: "sst",
    kind: "opt-out",
    name: "SST",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["sst"],
    env: {
      key: "SST_TELEMETRY_DISABLED",
      value: "1",
    },
    alsoSatisfiedBy: [
      {
        key: "DO_NOT_TRACK",
        value: "1",
      },
    ],
    docs: "https://sst.dev/docs/reference/cli/",
  },
  {
    id: "scarf",
    kind: "opt-out",
    name: "Scarf runtime SDKs",
    ecosystem: "multiple",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "SCARF_NO_ANALYTICS",
      value: "true",
    },
    notes:
      "Runtime SDK opt-outs; package-download analytics and Scarf pixels are separate mechanisms. No npm package match is assumed.",
    docs: "https://docs.scarf.sh/custom-telemetry/",
  },
  {
    id: "pop-cli",
    kind: "unsupported",
    name: "Pop CLI",
    ecosystem: "rust",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Use pop telemetry --help for the installed release opt-out command, or compile without default telemetry features. No env opt-out is injected.",
    docs: "https://docs.rs/pop-telemetry/latest/pop_telemetry/",
  },
  {
    id: "vscode",
    kind: "unsupported",
    name: "Visual Studio Code",
    ecosystem: "multiple",
    verifiedAt: "2026-10-11",
    packages: [],
    notes:
      "Set telemetry.telemetryLevel to off in user settings. Extensions may collect telemetry independently; no env opt-out is injected.",
    docs: "https://code.visualstudio.com/docs/configure/telemetry",
  },
  {
    id: "prisma-8",
    name: "Prisma 8 CLI",
    kind: "opt-out",
    ecosystem: "javascript",
    verifiedAt: "2026-10-11",
    packages: ["prisma"],
    env: { key: "PRISMA_DISABLE_TELEMETRY", value: "1" },
    alsoSatisfiedBy: [{ key: "DO_NOT_TRACK", value: "1" }],
    notes:
      "Unified CLI since 8.0.0-rc.1; ignores legacy PRISMA_NEXT_* variables. Detection does not parse versions, so both Prisma CLI controls are recommended. This CLI does not load dotenv files itself; use run or export these values.",
    docs: "https://www.prisma.io/docs/cli/environment-variables",
  },
  {
    id: "crewai",
    name: "CrewAI",
    kind: "opt-out",
    ecosystem: "python",
    verifiedAt: "2026-10-11",
    packages: [],
    env: {
      key: "CREWAI_DISABLE_TELEMETRY",
      value: "true",
      accepts: ["true", "1", "yes", "on"],
      caseInsensitive: true,
    },
    notes:
      "Verified in CrewAI v1.15.27 docs. Disables CrewAI's private telemetry exporter; AMP tracing is separate. Prefer this scoped switch to OTEL_SDK_DISABLED, which also disables application instrumentation.",
    docs: "https://docs.crewai.com/v1.15.27/en/telemetry",
  },
];

/** Always written by `init` - harmless universal fallback. */
export const DO_NOT_TRACK: EnvOptOut = {
  key: "DO_NOT_TRACK",
  value: "1",
  accepts: ["1", "true"],
};
