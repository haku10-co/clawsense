import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const APP_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "ClawSense");
export const SCREENSHOTS_DIR = path.join(APP_DATA_DIR, "screenshots");

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "trigger";
}

export async function captureScreen(triggerId: string): Promise<string> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${timestamp}-${safeFilePart(triggerId)}.png`);

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
