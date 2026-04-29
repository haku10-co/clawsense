import { clipboard } from "electron";

export function copyResumeCommand(sessionId: string, claudeBin = "claude"): string {
  const safe = shellQuote(sessionId);
  const command = `${shellQuote(claudeBin)} --resume ${safe}`;
  clipboard.writeText(command);
  return command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
