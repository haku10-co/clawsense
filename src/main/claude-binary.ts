import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { cliEnv } from "./cli-env";

/* macOS GUI apps launched from Finder (a packaged ClawSense.app) inherit the
   bare LaunchServices environment, not the user's shell PATH. The `claude`
   CLI lives in places like /opt/homebrew/bin, ~/.local/bin, or
   /Applications/cmux*.app/Contents/Resources/bin and is invisible to a
   plain spawn("claude", ...). This module probes well-known paths and falls
   back to a login shell to find the real binary, then caches the result. */

const COMMON_PATHS: readonly string[] = [
  path.join(process.env.HOME ?? "", ".local/bin/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "/Applications/cmux-tb.app/Contents/Resources/bin/claude",
  "/Applications/cmux.app/Contents/Resources/bin/claude"
];

export type ClaudeBinaryInfo = {
  path: string;
  version: string;
};

let cached: { value: ClaudeBinaryInfo | null; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

function shellCandidates(): string[] {
  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash"].filter(
    (shell): shell is string => Boolean(shell)
  );
  return [...new Set(candidates)];
}

function shellWhich(timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const shells = shellCandidates();
    let idx = 0;

    const runNext = (): void => {
      if (settled) {
        return;
      }
      const shell = shells[idx++];
      if (!shell) {
        settled = true;
        resolve(null);
        return;
      }

      stdout = "";
      const proc = spawn(shell, ["-lic", "command -v claude"], {
        stdio: ["ignore", "pipe", "ignore"],
        env: cliEnv()
      });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        runNext();
      }, timeoutMs);

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      proc.on("error", () => {
        clearTimeout(timer);
        runNext();
      });
      proc.on("close", () => {
        clearTimeout(timer);
        const trimmed = stdout.trim().split("\n").pop()?.trim() ?? "";
        if (trimmed) {
          settled = true;
          resolve(trimmed);
          return;
        }
        runNext();
      });
    };

    runNext();
  });
}

function readClaudeVersion(
  binary: string,
  env?: NodeJS.ProcessEnv,
  timeoutMs = 2500
): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const proc = spawn(binary, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      env
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      proc.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
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
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve((stdout || stderr).trim() || null);
    });
  });
}

async function inspectClaude(binary: string): Promise<ClaudeBinaryInfo | null> {
  const version =
    (await readClaudeVersion(binary)) || (await readClaudeVersion(binary, cliEnv()));
  return version ? { path: binary, version } : null;
}

function versionParts(version: string): [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [0, 0, 0];
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < left.length; i++) {
    const diff = left[i] - right[i];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function cachedValue(): ClaudeBinaryInfo | null | undefined {
  if (!cached || Date.now() - cached.ts > CACHE_TTL_MS) {
    return undefined;
  }
  return cached.value;
}

function setCached(value: ClaudeBinaryInfo | null): ClaudeBinaryInfo | null {
  cached = { value, ts: Date.now() };
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function findClaudeBinaryInfo(): Promise<ClaudeBinaryInfo | null> {
  const value = cachedValue();
  if (value !== undefined) {
    return value;
  }

  const configured = process.env.CLAUDE_BINARY;
  if (configured) {
    const explicit = await inspectClaude(configured);
    if (explicit) {
      return setCached(explicit);
    }
  }

  const fromShell = await shellWhich();
  const candidates = unique([...COMMON_PATHS, fromShell ?? ""]).filter((p) => existsSync(p));
  const inspected = (await Promise.all(candidates.map((p) => inspectClaude(p)))).filter(
    (candidate): candidate is ClaudeBinaryInfo => Boolean(candidate)
  );

  if (inspected.length === 0) {
    return setCached(null);
  }

  inspected.sort((a, b) => compareVersions(b.version, a.version));
  return setCached(inspected[0]);
}

export async function findClaudeBinary(): Promise<string | null> {
  return (await findClaudeBinaryInfo())?.path ?? null;
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
  cached = null;
}
