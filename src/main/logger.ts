import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAppDataDir } from "./app-paths";

let writeQueue: Promise<void> = Promise.resolve();

export type LogEvent = Record<string, unknown>;

export function getEventsPath(): string {
  return path.join(getAppDataDir(), "events.jsonl");
}

async function appendJsonLine(event: LogEvent): Promise<void> {
  const eventsPath = getEventsPath();
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });

  const line = `${JSON.stringify(event)}\n`;
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(eventsPath, { flags: "a", encoding: "utf8" });
    stream.once("error", reject);
    stream.once("finish", resolve);
    stream.end(line);
  });
}

export async function logEvent(event: LogEvent): Promise<void> {
  writeQueue = writeQueue.then(() => appendJsonLine(event), () => appendJsonLine(event));
  return writeQueue;
}
