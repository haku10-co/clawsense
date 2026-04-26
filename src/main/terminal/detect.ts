import { existsSync } from "node:fs";

export type TerminalApp =
  | "terminal"
  | "iterm2"
  | "ghostty"
  | "warp"
  | "wezterm"
  | "kitty"
  | "alacritty";

const APP_PATHS: Record<TerminalApp, string> = {
  terminal: "/System/Applications/Utilities/Terminal.app",
  iterm2: "/Applications/iTerm.app",
  ghostty: "/Applications/Ghostty.app",
  warp: "/Applications/Warp.app",
  wezterm: "/Applications/WezTerm.app",
  kitty: "/Applications/kitty.app",
  alacritty: "/Applications/Alacritty.app"
};

const PRIORITY: TerminalApp[] = [
  "iterm2",
  "ghostty",
  "wezterm",
  "kitty",
  "alacritty",
  "warp",
  "terminal"
];

export function listInstalled(): TerminalApp[] {
  return PRIORITY.filter((app) => existsSync(APP_PATHS[app]));
}

export function pickPreferred(): TerminalApp {
  const installed = listInstalled();
  return installed[0] ?? "terminal";
}
