import { app } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { cliPath } from "./cli-env";
import { findClaudeBinaryInfo } from "./claude-binary";
import { getAppDataDir, getLogsDir } from "./app-paths";
import { logEvent } from "./logger";

const execFileAsync = promisify(execFile);

function appBundlePath(): string | null {
  if (!app.isPackaged || !process.execPath.includes(".app/Contents/MacOS/")) {
    return null;
  }
  return path.dirname(path.dirname(path.dirname(process.execPath)));
}

async function codeSignatureStatus(bundlePath: string | null): Promise<string> {
  if (!bundlePath) {
    return "not-packaged";
  }
  try {
    await execFileAsync("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      bundlePath
    ]);
    return "valid";
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    return (err.stderr || err.stdout || err.message || "invalid").slice(0, 500);
  }
}

export async function logStartupDiagnostics(): Promise<void> {
  const bundlePath = appBundlePath();
  const [claudeBinaryInfo, signing] = await Promise.all([
    findClaudeBinaryInfo().catch(() => null),
    codeSignatureStatus(bundlePath)
  ]);

  await logEvent({
    type: "startup",
    createdAt: new Date().toISOString(),
    appName: app.getName(),
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    defaultApp: process.defaultApp === true,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    userData: getAppDataDir(),
    logs: getLogsDir(),
    bundlePath,
    signing,
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    shell: process.env.SHELL ?? null,
    path: cliPath(),
    claudeBinary: claudeBinaryInfo?.path ?? null,
    claudeVersion: claudeBinaryInfo?.version ?? null
  });
}
