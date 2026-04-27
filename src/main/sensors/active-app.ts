import { spawn } from "node:child_process";

/* Returns the macOS frontmost application's localized name. Uses
   `osascript` against System Events. The first run shows an Automation
   permission dialog; once granted (or denied) we proceed silently. Any
   failure resolves to null so callers can degrade gracefully. */

const TIMEOUT_MS = 1200;
const SCRIPT =
  'tell application "System Events" to name of first application process whose frontmost is true';

export type ActiveApp = {
  name: string;
};

export function getActiveApp(): Promise<ActiveApp | null> {
  if (process.platform !== "darwin") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const proc = spawn("/usr/bin/osascript", ["-e", SCRIPT], {
      stdio: ["ignore", "pipe", "ignore"]
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        resolve(null);
      }
    }, TIMEOUT_MS);

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        const name = stdout.trim();
        resolve(name ? { name } : null);
      } else {
        resolve(null);
      }
    });
  });
}
