import { systemPreferences, desktopCapturer, shell } from "electron";

export type ScreenAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

const SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

export function getScreenAccessStatus(): ScreenAccessStatus {
  if (process.platform !== "darwin") {
    return "granted";
  }
  return systemPreferences.getMediaAccessStatus("screen") as ScreenAccessStatus;
}

export async function triggerScreenAccessPrompt(): Promise<void> {
  // Calling desktopCapturer triggers the macOS permission dialog the first
  // time, and is a no-op afterwards. Errors are intentionally ignored.
  try {
    await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
  } catch {
    /* swallow — the dialog itself or the existing decision is what matters */
  }
}

export function openScreenRecordingSettings(): void {
  void shell.openExternal(SETTINGS_URL);
}
