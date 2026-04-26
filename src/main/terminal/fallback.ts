import { clipboard } from "electron";

export function copyResumeCommand(sessionId: string): string {
  const safe = shellQuote(sessionId);
  const command = `claude --resume ${safe}`;
  clipboard.writeText(command);
  return command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
