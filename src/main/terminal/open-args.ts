import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TerminalApp } from "./detect";

const execFileAsync = promisify(execFile);

export type OpenArgsLauncher = (argv: string[]) => Promise<void>;

const LAUNCHERS: Partial<Record<TerminalApp, (sessionId: string, claudeBin: string) => string[]>> = {
  ghostty: (sid, claudeBin) => [
    "-na",
    "Ghostty",
    "--args",
    "-e",
    claudeBin,
    "--resume",
    sid
  ],
  wezterm: (sid, claudeBin) => [
    "-na",
    "WezTerm",
    "--args",
    "start",
    "--",
    claudeBin,
    "--resume",
    sid
  ],
  kitty: (sid, claudeBin) => ["-na", "kitty", "--args", claudeBin, "--resume", sid],
  alacritty: (sid, claudeBin) => ["-na", "Alacritty", "--args", "-e", claudeBin, "--resume", sid]
};

export function hasOpenArgsLauncher(app: TerminalApp): boolean {
  return Boolean(LAUNCHERS[app]);
}

export async function openWithArgs(
  app: TerminalApp,
  sessionId: string,
  claudeBin: string
): Promise<void> {
  const builder = LAUNCHERS[app];
  if (!builder) {
    throw new Error(`No open-args launcher registered for ${app}`);
  }

  await execFileAsync("open", builder(sessionId, claudeBin));
}
