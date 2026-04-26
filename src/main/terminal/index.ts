import { pickPreferred, type TerminalApp } from "./detect";
import { hasOpenArgsLauncher, openWithArgs } from "./open-args";
import { copyResumeCommand } from "./fallback";
import { openInIterm2, openInTerminalApp } from "./terminal-app";

export type OpenInTerminalOptions = {
  sessionId: string;
  app?: TerminalApp;
};

export type OpenInTerminalResult = {
  app: TerminalApp;
  fallback: boolean;
  command: string;
};

function buildResumeCommand(sessionId: string): string {
  const quoted = `'${sessionId.replace(/'/g, `'\\''`)}'`;
  return `claude --resume ${quoted}`;
}

export async function openInPreferredTerminal(
  opts: OpenInTerminalOptions
): Promise<OpenInTerminalResult> {
  const app = opts.app ?? pickPreferred();
  const command = buildResumeCommand(opts.sessionId);

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
      await openWithArgs(app, opts.sessionId);
      return { app, fallback: false, command };
    }
  } catch {
    /* fall through to clipboard fallback */
  }

  const copied = copyResumeCommand(opts.sessionId);
  return { app, fallback: true, command: copied };
}

export type { TerminalApp };
