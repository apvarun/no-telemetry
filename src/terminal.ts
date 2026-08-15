export type ColorEnvironment = {
  NO_COLOR?: string;
  FORCE_COLOR?: string;
};

/** Resolve CLI color output from environment overrides and TTY state. */
export function shouldUseColor(isTTY: boolean, env: ColorEnvironment): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR === "0") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
  return isTTY;
}
