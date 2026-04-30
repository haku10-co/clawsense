import { app } from "electron";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";

export type AppLanguage = "ja" | "en";

export type AppSettings = {
  language: AppLanguage;
};

const DEFAULT_SETTINGS: AppSettings = {
  language: "ja"
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : "ja";
}

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const record = value as Record<string, unknown>;
  return {
    language: normalizeLanguage(record.language)
  };
}

export function readSettingsSync(): AppSettings {
  try {
    const raw = fsSync.readFileSync(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeSettings(settings);
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function ensureSettingsExist(): Promise<void> {
  try {
    await fs.access(settingsPath());
  } catch {
    await saveSettings(DEFAULT_SETTINGS);
  }
}
