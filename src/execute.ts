import { spawn } from "node:child_process";
import { constants } from "node:os";

/** CLI-only process launching; no shell interpretation or stream transformation. */
export async function executeCommand(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      const child = spawn(command, args, { env, stdio: "inherit", shell: false });
      const forwardInt = () => {
        child.kill("SIGINT");
      };
      const forwardTerm = () => {
        child.kill("SIGTERM");
      };
      const cleanup = () => {
        process.off("SIGINT", forwardInt);
        process.off("SIGTERM", forwardTerm);
      };
      process.on("SIGINT", forwardInt);
      process.on("SIGTERM", forwardTerm);
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("close", (code, signal) => {
        cleanup();
        resolve({ code, signal });
      });
    },
  );
  if (outcome.signal) {
    if (process.platform !== "win32") process.kill(process.pid, outcome.signal);
    return 128 + (constants.signals[outcome.signal] ?? 0);
  }
  return outcome.code ?? 2;
}
