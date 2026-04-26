import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TerminalApp } from "./detect";

const execFileAsync = promisify(execFile);

export type OpenArgsLauncher = (argv: string[]) => Promise<void>;

const LAUNCHERS: Partial<Record<TerminalApp, (sessionId: string) => string[]>> = {
  ghostty: (sid) => [
    "-na",
    "Ghostty",
    "--args",
    "-e",
    "claude",
    "--resume",
    sid
  ],
  wezterm: (sid) => [
    "-na",
    "WezTerm",
    "--args",
    "start",
    "--",
    "claude",
    "--resume",
    sid
  ],
  kitty: (sid) => ["-na", "kitty", "--args", "claude", "--resume", sid],
  alacritty: (sid) => ["-na", "Alacritty", "--args", "-e", "claude", "--resume", sid]
};

export function hasOpenArgsLauncher(app: TerminalApp): boolean {
  return Boolean(LAUNCHERS[app]);
}

export async function openWithArgs(app: TerminalApp, sessionId: string): Promise<void> {
  const builder = LAUNCHERS[app];
  if (!builder) {
    throw new Error(`No open-args launcher registered for ${app}`);
  }

  await execFileAsync("open", builder(sessionId));
}
