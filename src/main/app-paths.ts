import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export const APP_NAME = "ClawSense";

export function configureAppPaths(): void {
  app.setName(APP_NAME);

  const dataDir = path.join(app.getPath("appData"), APP_NAME);
  const sessionDir = path.join(dataDir, "session");
  const logsDir = path.join(dataDir, "logs");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  app.setPath("userData", dataDir);
  app.setPath("sessionData", sessionDir);
  app.setAppLogsPath(logsDir);
}

export function getAppDataDir(): string {
  return app.getPath("userData");
}

export function getLogsDir(): string {
  return path.join(getAppDataDir(), "logs");
}
