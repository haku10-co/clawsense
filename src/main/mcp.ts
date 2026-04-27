import { spawn } from "node:child_process";
import { findClaudeBinary } from "./claude-binary";

export type McpStatus = "connected" | "needs-auth" | "failed";

export type McpServer = {
  name: string;
  status: McpStatus;
};

const CACHE_TTL_MS = 30_000;
const LIST_TIMEOUT_MS = 8_000;

let cache: { servers: McpServer[]; ts: number } | null = null;

async function runMcpList(timeoutMs: number): Promise<string> {
  const binary = await findClaudeBinary();
  if (!binary) {
    throw new Error("claude CLI not found");
  }
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const proc = spawn(binary, ["mcp", "list"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        reject(new Error(`mcp list timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`mcp list exited ${code}: ${stderr.slice(0, 200)}`));
      }
    });
  });
}

function detectStatus(tail: string): McpStatus | null {
  if (tail.includes("✓ Connected") || /Connected$/i.test(tail)) {
    return "connected";
  }
  if (tail.includes("Needs authentication") || tail.includes("⚠")) {
    return "needs-auth";
  }
  if (tail.includes("Failed") || tail.includes("✗")) {
    return "failed";
  }
  return null;
}

function parseMcpList(output: string): McpServer[] {
  const servers: McpServer[] = [];
  const lines = output.split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("Checking") || line.startsWith("Configured")) {
      continue;
    }

    const colon = line.indexOf(":");
    const dash = line.lastIndexOf(" - ");
    if (colon < 0 || dash < 0 || dash < colon) {
      continue;
    }

    const name = line.slice(0, colon).trim();
    const tail = line.slice(dash + 3).trim();
    const status = detectStatus(tail);
    if (name && status) {
      servers.push({ name, status });
    }
  }

  return servers;
}

export async function listConnectedMcpServers(): Promise<McpServer[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.servers;
  }
  try {
    const output = await runMcpList(LIST_TIMEOUT_MS);
    const servers = parseMcpList(output);
    cache = { servers, ts: Date.now() };
    return servers;
  } catch {
    return [];
  }
}

export function clearMcpCache(): void {
  cache = null;
}
