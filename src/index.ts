export {
  REGISTRY,
  DO_NOT_TRACK,
  type RegistryEntry,
  type OptOutEntry,
  type OptInEntry,
  type UnsupportedEntry,
  type EnvOptOut,
} from "./registry.ts";
export {
  scan,
  evaluate,
  planInit,
  applyInit,
  parseEnvFile,
  readDeps,
  isInstalled,
  failsCheck,
  type LibraryResult,
  type Status,
  type InitPlanItem,
} from "./core.ts";
