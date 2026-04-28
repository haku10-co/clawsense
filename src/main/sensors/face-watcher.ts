import { BrowserWindow, session, systemPreferences } from "electron";
import path from "node:path";

/* Face watcher — main-process side.
   Owns a hidden BrowserWindow that loads face-watcher.html. The renderer
   pulls camera frames, runs MediaPipe, and pushes a struggle score over
   IPC. We stay agnostic to the camera source (built-in / Continuity /
   external / virtual capture from another Mac) — anything getUserMedia
   surfaces will do.
*/

export type FaceSample = {
  score: number;
  faceVisible: boolean;
};

const SUSTAIN_WINDOW_MS = 5_000;
const STRUGGLE_THRESHOLD = 0.35;

let watcherWindow: BrowserWindow | null = null;
let recentSamples: { ts: number; sample: FaceSample }[] = [];
let lastSummaryAt = 0;

function rendererPath(fileName: string): string {
  return path.join(__dirname, "..", "..", "..", "src", "renderer", fileName);
}

function ensureCameraPermission(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
      return;
    }
    callback(false);
  });
}

function summarize(): void {
  const now = Date.now();
  if (now - lastSummaryAt < 1000) {
    return;
  }
  lastSummaryAt = now;

  const cutoff = now - SUSTAIN_WINDOW_MS;
  recentSamples = recentSamples.filter((entry) => entry.ts >= cutoff);

  if (recentSamples.length === 0) {
    return;
  }

  const visibleCount = recentSamples.filter((s) => s.sample.faceVisible).length;
  const totalScore = recentSamples.reduce((acc, s) => acc + s.sample.score, 0);
  const avgScore = totalScore / recentSamples.length;
  const overThreshold = recentSamples.filter(
    (s) => s.sample.score >= STRUGGLE_THRESHOLD
  ).length;
  const ratioOver = overThreshold / recentSamples.length;

  console.log(
    `[face/main] window=${SUSTAIN_WINDOW_MS / 1000}s ` +
      `samples=${recentSamples.length} ` +
      `visibleRatio=${(visibleCount / recentSamples.length).toFixed(2)} ` +
      `avg=${avgScore.toFixed(3)} ` +
      `overThresh=${ratioOver.toFixed(2)}`
  );
}

export function recordFaceSample(sample: FaceSample): void {
  recentSamples.push({ ts: Date.now(), sample });
  summarize();
}

async function ensureMacOSCameraAccess(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  const status = systemPreferences.getMediaAccessStatus("camera");
  console.log(`[face/main] camera TCC status: ${status}`);
  if (status === "not-determined") {
    try {
      const granted = await systemPreferences.askForMediaAccess("camera");
      console.log(`[face/main] camera prompt result: granted=${granted}`);
    } catch (err) {
      console.error("[face/main] camera prompt failed:", err);
    }
  }
}

export function startFaceWatcher(opts: { preloadPath: string }): void {
  if (watcherWindow && !watcherWindow.isDestroyed()) {
    return;
  }
  ensureCameraPermission();
  void ensureMacOSCameraAccess();

  watcherWindow = new BrowserWindow({
    width: 320,
    height: 240,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: opts.preloadPath,
      backgroundThrottling: false,
      offscreen: false
    }
  });

  watcherWindow.loadFile(rendererPath("face-watcher.html"));
  watcherWindow.webContents.on("console-message", (event) => {
    const message = (event as { message?: string }).message ?? "";
    if (message) {
      console.log(`[face/renderer] ${message}`);
    }
  });
  watcherWindow.on("closed", () => {
    watcherWindow = null;
  });
}

export function stopFaceWatcher(): void {
  if (watcherWindow && !watcherWindow.isDestroyed()) {
    watcherWindow.close();
  }
  watcherWindow = null;
  recentSamples = [];
}
