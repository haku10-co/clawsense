import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "ClawSense");
const EVENTS_PATH = path.join(APP_DATA_DIR, "events.jsonl");

let writeQueue: Promise<void> = Promise.resolve();

export type LogEvent = Record<string, unknown>;

async function appendJsonLine(event: LogEvent): Promise<void> {
  await fs.mkdir(APP_DATA_DIR, { recursive: true });

  const line = `${JSON.stringify(event)}\n`;
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(EVENTS_PATH, { flags: "a", encoding: "utf8" });
    stream.once("error", reject);
    stream.once("finish", resolve);
    stream.end(line);
  });
}

export async function logEvent(event: LogEvent): Promise<void> {
  writeQueue = writeQueue.then(() => appendJsonLine(event), () => appendJsonLine(event));
  return writeQueue;
}
