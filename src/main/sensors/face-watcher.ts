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
  rawScore?: number;
  baselineScore?: number;
  maxDelta?: number;
  calibrated?: boolean;
  blendshapeScore?: number;
  landmarkScore?: number;
  fusedScore?: number;
  landmark?: {
    score: number;
    compression: number;
    browDrop: number;
    browRaise: number;
    poseOk: boolean;
    geometry: {
      innerBrowDistance: number;
      browEyeGap: number;
      browEyeGapLeft: number;
      browEyeGapRight: number;
      asymmetry: number;
      faceScale: number;
      rollDeg: number;
    };
  } | null;
  breakdown?: {
    browDown: number;
    browInnerUp: number;
    mouthFrown: number;
    eyeSquint: number;
  } | null;
};

const SUSTAIN_WINDOW_MS = 5_000;
const STRUGGLE_THRESHOLD = 0.45;

let watcherWindow: BrowserWindow | null = null;
let recentSamples: { ts: number; sample: FaceSample }[] = [];
let lastSummaryAt = 0;
let restartTimer: NodeJS.Timeout | null = null;

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
  const calibratedSamples = recentSamples.filter((s) => s.sample.calibrated !== false);
  const totalScore = recentSamples.reduce((acc, s) => acc + s.sample.score, 0);
  const avgScore = totalScore / recentSamples.length;
  const maxScore = Math.max(...recentSamples.map((s) => s.sample.score));
  const avgRaw =
    recentSamples.reduce((acc, s) => acc + (s.sample.rawScore ?? 0), 0) / recentSamples.length;
  const avgBaseline =
    recentSamples.reduce((acc, s) => acc + (s.sample.baselineScore ?? 0), 0) /
    recentSamples.length;
  const avgMaxDelta =
    recentSamples.reduce((acc, s) => acc + (s.sample.maxDelta ?? 0), 0) / recentSamples.length;
  const avgBlend =
    recentSamples.reduce((acc, s) => acc + (s.sample.blendshapeScore ?? s.sample.score), 0) /
    recentSamples.length;
  const avgLandmark =
    recentSamples.reduce((acc, s) => acc + (s.sample.landmarkScore ?? 0), 0) /
    recentSamples.length;
  const avgFused =
    recentSamples.reduce((acc, s) => acc + (s.sample.fusedScore ?? s.sample.score), 0) /
    recentSamples.length;
  const landmarkSamples = recentSamples
    .map((s) => s.sample.landmark)
    .filter((l): l is NonNullable<FaceSample["landmark"]> => Boolean(l));
  const poseOkRatio =
    landmarkSamples.length > 0
      ? landmarkSamples.filter((l) => l.poseOk).length / landmarkSamples.length
      : 0;
  const overThreshold = recentSamples.filter(
    (s) => s.sample.score >= STRUGGLE_THRESHOLD
  ).length;
  const ratioOver = overThreshold / recentSamples.length;
  const breakdownSamples = recentSamples
    .map((s) => s.sample.breakdown)
    .filter((b): b is NonNullable<FaceSample["breakdown"]> => Boolean(b));
  const avgBreakdown =
    breakdownSamples.length > 0
      ? breakdownSamples.reduce(
          (acc, b) => {
            acc.browDown += b.browDown;
            acc.browInnerUp += b.browInnerUp;
            acc.mouthFrown += b.mouthFrown;
            acc.eyeSquint += b.eyeSquint;
            return acc;
          },
          { browDown: 0, browInnerUp: 0, mouthFrown: 0, eyeSquint: 0 }
        )
      : null;
  if (avgBreakdown) {
    avgBreakdown.browDown /= breakdownSamples.length;
    avgBreakdown.browInnerUp /= breakdownSamples.length;
    avgBreakdown.mouthFrown /= breakdownSamples.length;
    avgBreakdown.eyeSquint /= breakdownSamples.length;
  }

  console.log(
    `[face/main] window=${SUSTAIN_WINDOW_MS / 1000}s ` +
      `samples=${recentSamples.length} ` +
      `visibleRatio=${(visibleCount / recentSamples.length).toFixed(2)} ` +
      `calibratedRatio=${(calibratedSamples.length / recentSamples.length).toFixed(2)} ` +
      `avg=${avgScore.toFixed(3)} ` +
      `max=${maxScore.toFixed(3)} ` +
      `raw=${avgRaw.toFixed(3)} ` +
      `base=${avgBaseline.toFixed(3)} ` +
      `delta=${avgMaxDelta.toFixed(3)} ` +
      `blend=${avgBlend.toFixed(3)} ` +
      `geo=${avgLandmark.toFixed(3)} ` +
      `fused=${avgFused.toFixed(3)} ` +
      `poseOk=${poseOkRatio.toFixed(2)} ` +
      `overThresh=${ratioOver.toFixed(2)}` +
      (avgBreakdown
        ? ` brow=${avgBreakdown.browDown.toFixed(3)} ` +
          `inner=${avgBreakdown.browInnerUp.toFixed(3)} ` +
          `frown=${avgBreakdown.mouthFrown.toFixed(3)} ` +
          `squint=${avgBreakdown.eyeSquint.toFixed(3)}`
        : "")
  );
}

export function recordFaceSample(sample: FaceSample): void {
  recentSamples.push({ ts: Date.now(), sample });
  summarize();
}

async function ensureMacOSCameraAccess(): Promise<boolean> {
  if (process.platform !== "darwin") {
    return true;
  }
  const status = systemPreferences.getMediaAccessStatus("camera");
  console.log(`[face/main] camera TCC status: ${status}`);
  if (status === "granted") {
    return true;
  }
  if (status === "not-determined") {
    try {
      const granted = await systemPreferences.askForMediaAccess("camera");
      console.log(`[face/main] camera prompt result: granted=${granted}`);
      return granted;
    } catch (err) {
      console.error("[face/main] camera prompt failed:", err);
      return false;
    }
  }
  return false;
}

function scheduleRestart(opts: { preloadPath: string }, reason: string): void {
  if (restartTimer) {
    return;
  }
  console.warn(`[face/main] restarting watcher after ${reason}`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void startFaceWatcher(opts);
  }, 2_000);
}

export async function startFaceWatcher(opts: { preloadPath: string }): Promise<void> {
  if (watcherWindow && !watcherWindow.isDestroyed()) {
    return;
  }
  ensureCameraPermission();

  const showDebugUi = process.env.CLAWSENSE_FACE_DEBUG === "1";
  const cameraAllowed = await ensureMacOSCameraAccess();
  if (!cameraAllowed && !showDebugUi) {
    console.warn("[face/main] camera unavailable; face watcher not started");
    return;
  }

  watcherWindow = new BrowserWindow({
    title: "ClawSense Face Watcher",
    width: showDebugUi ? 480 : 320,
    height: showDebugUi ? 540 : 240,
    show: showDebugUi,
    frame: showDebugUi,
    resizable: showDebugUi,
    skipTaskbar: !showDebugUi,
    transparent: !showDebugUi,
    backgroundColor: showDebugUi ? "#0b0f17" : undefined,
    webPreferences: {
      preload: opts.preloadPath,
      backgroundThrottling: false,
      offscreen: false
    }
  });

  watcherWindow.loadFile(rendererPath("face-watcher.html")).catch((err) => {
    console.error("[face/main] load failed:", err);
    scheduleRestart(opts, "load failure");
  });
  watcherWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[face/main] did-fail-load code=${code} description=${description}`);
    scheduleRestart(opts, "did-fail-load");
  });
  watcherWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[face/main] renderer gone:", details);
    if (watcherWindow && !watcherWindow.isDestroyed()) {
      watcherWindow.destroy();
    }
    watcherWindow = null;
    scheduleRestart(opts, details.reason);
  });
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
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (watcherWindow && !watcherWindow.isDestroyed()) {
    watcherWindow.close();
  }
  watcherWindow = null;
  recentSamples = [];
}
