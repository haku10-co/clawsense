import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Turn } from "./types";

export type HistoricalSession = {
  triggerId: string;
  sessionId: string;
  screenshotPath: string;
  selectedLabel: string;
  turns: Turn[];
  createdAt: string;
  updatedAt: string;
};

const FILE = path.join(app.getPath("userData"), "sessions.json");
const MAX_HISTORY = 100;

async function readAll(): Promise<HistoricalSession[]> {
  try {
    const text = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed as HistoricalSession[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function writeAll(items: HistoricalSession[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function listRecent(limit: number = 10): Promise<HistoricalSession[]> {
  const all = await readAll();
  return all.slice(0, limit);
}

export async function saveSession(session: HistoricalSession): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.triggerId === session.triggerId);
  if (idx >= 0) {
    all.splice(idx, 1);
  }
  all.unshift(session);
  await writeAll(all.slice(0, MAX_HISTORY));
}

export async function getById(triggerId: string): Promise<HistoricalSession | null> {
  const all = await readAll();
  return all.find((s) => s.triggerId === triggerId) ?? null;
}
