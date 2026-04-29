import { pickPreferred, type TerminalApp } from "./detect";
import { hasOpenArgsLauncher, openWithArgs } from "./open-args";
import { copyResumeCommand } from "./fallback";
import { openInIterm2, openInTerminalApp } from "./terminal-app";
import { findClaudeBinary } from "../claude-binary";

export type OpenInTerminalOptions = {
  sessionId: string;
  app?: TerminalApp;
};

export type OpenInTerminalResult = {
  app: TerminalApp;
  fallback: boolean;
  command: string;
};

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function resolveClaudeForTerminal(): Promise<string> {
  return (await findClaudeBinary()) ?? "claude";
}

function buildResumeCommand(sessionId: string, claudeBin: string): string {
  const quoted = `'${sessionId.replace(/'/g, `'\\''`)}'`;
  return `${quoteShell(claudeBin)} --resume ${quoted}`;
}

export async function openInPreferredTerminal(
  opts: OpenInTerminalOptions
): Promise<OpenInTerminalResult> {
  const app = opts.app ?? pickPreferred();
  const claudeBin = await resolveClaudeForTerminal();
  const command = buildResumeCommand(opts.sessionId, claudeBin);

  try {
    if (app === "terminal") {
      await openInTerminalApp(command);
      return { app, fallback: false, command };
    }

    if (app === "iterm2") {
      await openInIterm2(command);
      return { app, fallback: false, command };
    }

    if (hasOpenArgsLauncher(app)) {
      await openWithArgs(app, opts.sessionId, claudeBin);
      return { app, fallback: false, command };
    }
  } catch {
    /* fall through to clipboard fallback */
  }

  const copied = copyResumeCommand(opts.sessionId, claudeBin);
  return { app, fallback: true, command: copied };
}

export type { TerminalApp };
