import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openInTerminalApp(command: string): Promise<void> {
  const b64 = Buffer.from(command, "utf8").toString("base64");
  const script = [
    'tell application "Terminal"',
    "  activate",
    `  do script "eval \\"$(echo ${b64} | base64 -d)\\""`,
    "end tell"
  ].join("\n");

  await execFileAsync("osascript", ["-e", script]);
}

export async function openInIterm2(command: string): Promise<void> {
  const b64 = Buffer.from(command, "utf8").toString("base64");
  const script = [
    'tell application "iTerm"',
    "  activate",
    "  set newWindow to (create window with default profile)",
    "  tell current session of newWindow",
    `    write text "eval \\"$(echo ${b64} | base64 -d)\\""`,
    "  end tell",
    "end tell"
  ].join("\n");

  await execFileAsync("osascript", ["-e", script]);
}
