import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/* macOS GUI apps launched from Finder (a packaged ClawSense.app) inherit the
   bare LaunchServices environment, not the user's shell PATH. The `claude`
   CLI lives in places like /opt/homebrew/bin, ~/.local/bin, or
   /Applications/cmux*.app/Contents/Resources/bin and is invisible to a
   plain spawn("claude", ...). This module probes well-known paths and falls
   back to a login shell to find the real binary, then caches the result. */

const COMMON_PATHS: readonly string[] = [
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "/Applications/cmux-tb.app/Contents/Resources/bin/claude",
  "/Applications/cmux.app/Contents/Resources/bin/claude"
];

let cached: string | null | undefined;

function homePath(suffix: string): string | null {
  const home = process.env.HOME;
  return home ? path.join(home, suffix) : null;
}

function shellWhich(timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const proc = spawn("/bin/bash", ["-lc", "command -v claude"], {
      stdio: ["ignore", "pipe", "ignore"]
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        resolve(null);
      }
    }, timeoutMs);

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
    proc.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const trimmed = stdout.trim().split("\n").pop()?.trim() ?? "";
      resolve(trimmed || null);
    });
  });
}

export async function findClaudeBinary(): Promise<string | null> {
  if (cached !== undefined) {
    return cached;
  }

  const candidates: string[] = [...COMMON_PATHS];
  const localBin = homePath(".local/bin/claude");
  if (localBin) {
    candidates.push(localBin);
  }

  for (const p of candidates) {
    if (existsSync(p)) {
      cached = p;
      return p;
    }
  }

  const fromShell = await shellWhich();
  if (fromShell && existsSync(fromShell)) {
    cached = fromShell;
    return fromShell;
  }

  cached = null;
  return null;
}

export async function getClaudeBinaryOrThrow(): Promise<string> {
  const found = await findClaudeBinary();
  if (!found) {
    throw new Error(
      "claude CLI が見つかりません。`npm i -g @anthropic-ai/claude-code` でインストールするか、" +
        "/usr/local/bin/claude にシンボリックリンクを置いてください。"
    );
  }
  return found;
}

export function resetClaudeBinaryCache(): void {
  cached = undefined;
}
