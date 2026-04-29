import { app, screen } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function filePath(): string {
  return path.join(app.getPath("userData"), "window-bounds.json");
}

export async function loadBounds(): Promise<WindowBounds | null> {
  try {
    const text = await fs.readFile(filePath(), "utf8");
    const parsed = JSON.parse(text) as Partial<WindowBounds>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      return parsed as WindowBounds;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveBounds(bounds: WindowBounds): Promise<void> {
  try {
    const file = filePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(bounds), "utf8");
  } catch {
    /* ignore */
  }
}

export function clampToScreen(bounds: WindowBounds): WindowBounds {
  const display = screen.getDisplayMatching(bounds) ?? screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(Math.max(bounds.width, 320), area.width);
  const height = Math.min(Math.max(bounds.height, 240), area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}
