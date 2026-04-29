import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getAppDataDir } from "./app-paths";

const execFileAsync = promisify(execFile);

export function getScreenshotsDir(): string {
  return path.join(getAppDataDir(), "screenshots");
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "trigger";
}

export async function captureScreen(triggerId: string): Promise<string> {
  const screenshotsDir = getScreenshotsDir();
  await fs.mkdir(screenshotsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(screenshotsDir, `${timestamp}-${safeFilePart(triggerId)}.png`);

  await execFileAsync("screencapture", ["-x", "-t", "png", screenshotPath], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024
  });

  const stat = await fs.stat(screenshotPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Screen capture did not produce a valid PNG at ${screenshotPath}`);
  }

  return screenshotPath;
}
