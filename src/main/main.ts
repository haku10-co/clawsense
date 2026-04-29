import { app, BrowserWindow, ipcMain, Menu, Tray, globalShortcut, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { configureAppPaths, getAppDataDir, getLogsDir } from "./app-paths";
import { clampToScreen, loadBounds, saveBounds } from "./bounds";
import { captureScreen, getScreenshotsDir } from "./capture";
import { askClaude, ClaudeAbortError } from "./claude";
import { gatherContext, renderNoteBlock } from "./context";
import { getById, listRecent, saveSession, type HistoricalSession } from "./history";
import { registerIpcHandlers } from "./ipc";
import { logEvent } from "./logger";
import {
  openCameraSettings,
  getScreenAccessStatus,
  openScreenRecordingSettings,
  triggerScreenAccessPrompt
} from "./permissions";
import { ensurePromptsExist } from "./prompts";
import {
  recordFaceSample,
  startFaceWatcher,
  stopFaceWatcher,
  type FaceSample
} from "./sensors/face-watcher";
import {
  getCurrentActiveAppName,
  startAppContextWatcher,
  stopAppContextWatcher
} from "./sensors/app-context-watcher";
import {
  getLooksStuckConfig,
  markLooksStuckTriggered,
  recordLooksStuckSample,
  type LooksStuckState
} from "./sensors/looks-stuck-detector";
import { getSessionSnapshot, restoreSession } from "./session";
import { logStartupDiagnostics } from "./startup-diagnostics";
import type { ResultPayload, SuggestionPayload, TriggerSource } from "./types";
import {
  applyDockIndicator,
  applySuggestionPanelBounds,
  createPromptsWindow,
  createSuggestionWindow,
  createTrayIcon
} from "./windows";

let tray: Tray | null = null;
let suggestionWindow: BrowserWindow | null = null;
let promptsWindow: BrowserWindow | null = null;
let lastSuggestion: SuggestionPayload | null = null;
let pendingSuggestion: SuggestionPayload | null = null;
let cachedBounds: { x: number; y: number; width: number; height: number } | null = null;
let saveBoundsTimer: NodeJS.Timeout | null = null;
let recentHistory: HistoricalSession[] = [];
let currentAskController: AbortController | null = null;
let lastLooksStuckLogAt = 0;
let lastLooksStuckReason: string | null = null;
let suggestionDocked = false;
let shortcutRegistered = false;

const HOTKEY = "CommandOrControl+Shift+Space";
const FACE_DEBUG_ENABLED = process.env.CLAWSENSE_FACE_DEBUG === "1";
const LOOKS_STUCK_DEBUG_ENABLED =
  FACE_DEBUG_ENABLED || process.env.CLAWSENSE_LOOKS_STUCK_DEBUG === "1";
const PASSIVE_STUCK_ENABLED =
  process.env.CLAWSENSE_PASSIVE_STUCK === "0"
    ? false
    : process.env.CLAWSENSE_PASSIVE_STUCK === "1" || LOOKS_STUCK_DEBUG_ENABLED;
const FACE_WATCHER_ENABLED =
  PASSIVE_STUCK_ENABLED ||
  FACE_DEBUG_ENABLED ||
  process.env.CLAWSENSE_FACE_WATCHER === "1";
const LOOKS_STUCK_CONTEXT_ENABLED =
  PASSIVE_STUCK_ENABLED ||
  LOOKS_STUCK_DEBUG_ENABLED;
const LOOKS_STUCK_LOG_INTERVAL_MS = LOOKS_STUCK_DEBUG_ENABLED ? 2_500 : 10_000;
const LOOKS_STUCK_CONFIG = getLooksStuckConfig();

configureAppPaths();

const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.exit(0);
}

function preloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function scheduleBoundsPersist(): void {
  if (!suggestionWindow || suggestionWindow.isDestroyed()) {
    return;
  }
  if (suggestionDocked) {
    return;
  }
  if (saveBoundsTimer) {
    clearTimeout(saveBoundsTimer);
  }
  const bounds = suggestionWindow.getBounds();
  saveBoundsTimer = setTimeout(() => {
    void saveBounds(bounds);
    cachedBounds = bounds;
  }, 400);
}

function ensureSuggestionWindow(): BrowserWindow {
  if (suggestionWindow && !suggestionWindow.isDestroyed()) {
    return suggestionWindow;
  }

  suggestionWindow = createSuggestionWindow({
    preloadPath: preloadPath(),
    initialBounds: cachedBounds,
    onClosed: () => {
      suggestionWindow = null;
    },
    onLoaded: sendPendingSuggestion,
    onDomReady: sendPendingSuggestion
  });

  suggestionWindow.on("moved", scheduleBoundsPersist);
  suggestionWindow.on("resized", scheduleBoundsPersist);

  return suggestionWindow;
}

function showPromptsEditor(): void {
  if (!promptsWindow || promptsWindow.isDestroyed()) {
    promptsWindow = createPromptsWindow({
      preloadPath: preloadPath(),
      onClosed: () => (promptsWindow = null)
    });
  }
  promptsWindow.show();
  promptsWindow.focus();
}

function showSuggestion(payload: SuggestionPayload): void {
  const visiblePayload = { ...payload, compact: false };
  lastSuggestion = visiblePayload;
  pendingSuggestion = visiblePayload;
  const win = ensureSuggestionWindow();

  suggestionDocked = false;
  applySuggestionPanelBounds(win);
  win.showInactive();
  sendPendingSuggestion();
  setTimeout(sendPendingSuggestion, 100);
  setTimeout(sendPendingSuggestion, 500);
}

function showThinkingIndicator(triggerId: string): void {
  pendingSuggestion = {
    triggerId,
    headline: "考え中",
    hint: "",
    actions: [],
    rawText: "",
    latencyMs: 0,
    screenshotPath: "",
    pending: true,
    compact: true
  };

  const win = ensureSuggestionWindow();
  suggestionDocked = true;
  applyDockIndicator(win);
  win.showInactive();
  sendPendingSuggestion();
  setTimeout(sendPendingSuggestion, 100);
}

function sendPendingSuggestion(): void {
  if (!suggestionWindow || suggestionWindow.isDestroyed() || !pendingSuggestion) {
    return;
  }
  if (suggestionWindow.webContents.isLoading()) {
    return;
  }
  suggestionWindow.webContents.send("suggestion:update", pendingSuggestion);
}

function sendResult(payload: ResultPayload): void {
  if (!suggestionWindow || suggestionWindow.isDestroyed()) {
    return;
  }
  suggestionWindow.webContents.send("result:update", payload);
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error("[startup] failed:", message);
  void logEvent({
    type: "startup_error",
    createdAt: new Date().toISOString(),
    message
  });
}

function setTrayThinking(thinking: boolean): void {
  if (!tray || process.platform !== "darwin") {
    return;
  }
  tray.setTitle(thinking ? "CS·" : "CS");
}

function buildLooksStuckNote(state: LooksStuckState): string {
  return (
    "自動検出: 直近の作業で詰まっていそうな状態が継続しています。\n" +
    `activeApp=${state.activeAppName ?? "unknown"} ` +
    `window=${(state.windowMs / 1000).toFixed(1)}s ` +
    `avg=${state.avgScore.toFixed(3)} ` +
    `p75=${state.p75Score.toFixed(3)} ` +
    `max=${state.maxScore.toFixed(3)} ` +
    `over=${state.overRatio.toFixed(2)} ` +
    `visible=${state.visibleRatio.toFixed(2)} ` +
    `calibrated=${state.calibratedRatio.toFixed(2)} ` +
    `reason=${state.reason}`
  );
}

function logLooksStuckState(state: LooksStuckState, now: number): void {
  const reasonChanged = state.reason !== lastLooksStuckReason;
  const shouldLog =
    reasonChanged ||
    state.candidate ||
    LOOKS_STUCK_DEBUG_ENABLED ||
    now - lastLooksStuckLogAt >= LOOKS_STUCK_LOG_INTERVAL_MS;
  if (!shouldLog) {
    return;
  }
  if (!reasonChanged && !state.candidate && now - lastLooksStuckLogAt < LOOKS_STUCK_LOG_INTERVAL_MS) {
    return;
  }

  lastLooksStuckReason = state.reason;
  lastLooksStuckLogAt = now;
  console.log(
    `[looks-stuck] candidate=${state.candidate} triggerable=${state.triggerable} ` +
      `reason=${state.reason} passive=${PASSIVE_STUCK_ENABLED} app=${state.activeAppName ?? "unknown"} ` +
      `avg=${state.avgScore.toFixed(3)} p75=${state.p75Score.toFixed(3)} ` +
      `max=${state.maxScore.toFixed(3)} over=${state.overRatio.toFixed(2)} ` +
      `visible=${state.visibleRatio.toFixed(2)} calibrated=${state.calibratedRatio.toFixed(2)} ` +
      `appStable=${state.appStability.toFixed(2)} samples=${state.samples} ` +
      `window=${(state.windowMs / 1000).toFixed(1)}s`
  );
  void logEvent({
    type: state.candidate ? "looks_stuck_candidate" : "looks_stuck_state",
    createdAt: new Date().toISOString(),
    passiveEnabled: PASSIVE_STUCK_ENABLED,
    config: LOOKS_STUCK_CONFIG,
    ...state
  });
}

function handleLooksStuckSample(sample: FaceSample): void {
  const blocked =
    Boolean(currentAskController) ||
    Boolean(suggestionWindow && !suggestionWindow.isDestroyed() && suggestionWindow.isVisible());
  const state = recordLooksStuckSample(sample, {
    activeAppName: LOOKS_STUCK_CONTEXT_ENABLED ? getCurrentActiveAppName() : null,
    blocked
  });
  const now = Date.now();
  logLooksStuckState(state, now);
  if (PASSIVE_STUCK_ENABLED && state.triggerable) {
    markLooksStuckTriggered(now);
    void runAsk("looks-stuck", buildLooksStuckNote(state));
  }
}

async function runAsk(source: TriggerSource, userNote?: string): Promise<void> {
  if (currentAskController) {
    currentAskController.abort();
  }
  const ctrl = new AbortController();
  currentAskController = ctrl;

  const triggerId = randomUUID();
  const startedAt = Date.now();

  // 考えてる間は右下の小さいインジケータだけを出す。
  showThinkingIndicator(triggerId);
  setTrayThinking(true);

  const accessStatus = getScreenAccessStatus();
  if (accessStatus !== "granted") {
    void triggerScreenAccessPrompt();
    showSuggestion({
      triggerId,
      headline: "画面収録の権限が必要です",
      hint:
        accessStatus === "denied"
          ? "システム設定 > プライバシーとセキュリティ > 画面収録 で ClawSense を許可し、アプリを再起動してください。"
          : "ダイアログが表示されたら『許可』を押してください。許可後はアプリの再起動が必要です。",
      actions: [],
      rawText: `screen-access status: ${accessStatus}`,
      latencyMs: 0,
      screenshotPath: "",
      pending: false
    });
    await logEvent({
      type: "permission_blocked",
      triggerId,
      kind: "screen-recording",
      status: accessStatus,
      createdAt: new Date().toISOString()
    });
    if (currentAskController === ctrl) {
      currentAskController = null;
      setTrayThinking(false);
    }
    return;
  }

  try {
    const screenshotPromise = captureScreen(triggerId);
    const contextPromise = gatherContext({ userNote });

    const screenshotPath = await screenshotPromise;
    if (ctrl.signal.aborted) {
      return;
    }

    const context = await contextPromise;
    const noteBlock = renderNoteBlock(context);

    await logEvent({
      type: "trigger",
      id: triggerId,
      createdAt: new Date(startedAt).toISOString(),
      source,
      screenshotPath,
      userNote: context.userNote
    });

    if (ctrl.signal.aborted) {
      return;
    }
    const response = await askClaude({
      triggerId,
      screenshotPath,
      noteBlock,
      signal: ctrl.signal
    });
    const payload: SuggestionPayload = {
      ...response,
      headline:
        response.actions.length > 0 ? "次にやることを選んでください" : "提案を生成できませんでした",
      hint:
        response.actions.length > 0 ? "いちばん近いと思うアクションをクリック" : "「再提案」をお試しください",
      latencyMs: Date.now() - startedAt,
      screenshotPath,
      pending: false
    };

    await logEvent({
      type: "agent_response",
      triggerId,
      provider: "claude-cli",
      latencyMs: payload.latencyMs,
      actions: payload.actions,
      rawText: payload.rawText
    });

    showSuggestion(payload);
  } catch (error) {
    if (error instanceof ClaudeAbortError || ctrl.signal.aborted) {
      // 新しいリクエストに置き換えられた。何も表示しない。
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    showSuggestion({
      triggerId,
      headline: "リクエストを完了できませんでした",
      hint: message.slice(0, 220) || "画面収録の権限と Claude Code CLI のログイン状態をご確認ください",
      actions: [],
      rawText: message,
      latencyMs: Date.now() - startedAt,
      screenshotPath: "",
      pending: false
    });
    await logEvent({ type: "error", triggerId, message, createdAt: new Date().toISOString() });
  } finally {
    if (currentAskController === ctrl) {
      currentAskController = null;
      setTrayThinking(false);
    }
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

async function reopenHistorySession(triggerId: string): Promise<void> {
  const stored = await getById(triggerId);
  if (!stored) {
    return;
  }
  const payload = restoreSession(stored);
  const win = ensureSuggestionWindow();
  suggestionDocked = false;
  applySuggestionPanelBounds(win);
  win.showInactive();
  sendResult(payload);
}

function buildHistorySubmenu(): Electron.MenuItemConstructorOptions[] {
  if (recentHistory.length === 0) {
    return [{ label: "履歴なし", enabled: false }];
  }
  return recentHistory.map((s) => ({
    label: `${truncate(s.selectedLabel, 50)}  —  ${formatDate(s.updatedAt)}`,
    click: () => void reopenHistorySession(s.triggerId)
  }));
}

function buildMenu(): Menu {
  const lastScreenshot = lastSuggestion?.screenshotPath;
  const screenshotDir = getScreenshotsDir();
  return Menu.buildFromTemplate([
    { label: "ClawSense に聞く", click: () => void runAsk("menu") },
    {
      label: "直前の提案を開く",
      enabled: Boolean(lastSuggestion),
      click: () => lastSuggestion && showSuggestion(lastSuggestion)
    },
    { label: "履歴", submenu: buildHistorySubmenu() },
    { type: "separator" },
    { label: "プロンプトを編集...", click: () => showPromptsEditor() },
    {
      label: "デバッグ",
      submenu: [
        {
          label: shortcutRegistered ? `ホットキー: ${HOTKEY}` : `ホットキー未登録: ${HOTKEY}`,
          enabled: false
        },
        { label: "画面収録の設定を開く", click: () => openScreenRecordingSettings() },
        { label: "カメラの設定を開く", click: () => openCameraSettings() },
        { type: "separator" },
        { label: "データフォルダを開く", click: () => void shell.openPath(getAppDataDir()) },
        { label: "ログフォルダを開く", click: () => void shell.openPath(getLogsDir()) },
        { label: "スクショフォルダを開く", click: () => void shell.openPath(screenshotDir) },
        {
          label: "直前のスクショを開く",
          enabled: Boolean(lastScreenshot),
          click: () => lastScreenshot && void shell.openPath(lastScreenshot)
        }
      ]
    },
    { label: "終了", click: () => app.quit() }
  ]);
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu());
}

async function persistCurrentSession(): Promise<void> {
  const snap = getSessionSnapshot();
  if (!snap) {
    return;
  }
  await saveSession(snap);
  recentHistory = await listRecent(10);
  refreshTrayMenu();
}

app.on("second-instance", () => {
  refreshTrayMenu();
  if (lastSuggestion) {
    showSuggestion(lastSuggestion);
  }
});

process.on("uncaughtException", showStartupError);
process.on("unhandledRejection", showStartupError);

app.whenReady().then(async () => {
  app.dock?.hide();
  tray = new Tray(createTrayIcon());
  tray.setToolTip("ClawSense");
  if (process.platform === "darwin") {
    tray.setTitle("CS");
  }
  tray.setContextMenu(buildMenu());
  tray.on("click", () => {
    refreshTrayMenu();
    tray?.popUpContextMenu();
  });

  void logStartupDiagnostics().catch(showStartupError);

  await ensurePromptsExist().catch(() => {
    /* prompts dir creation failure should not block app startup */
  });

  const stored = await loadBounds();
  cachedBounds = stored ? clampToScreen(stored) : null;

  recentHistory = await listRecent(10).catch(() => []);
  if (LOOKS_STUCK_CONTEXT_ENABLED) {
    startAppContextWatcher();
  }

  shortcutRegistered = globalShortcut.register(HOTKEY, () => {
    void runAsk("hotkey");
  });
  if (!shortcutRegistered) {
    await logEvent({
      type: "hotkey_failed",
      createdAt: new Date().toISOString(),
      accelerator: HOTKEY
    });
  }
  refreshTrayMenu();

  registerIpcHandlers({
    getSuggestionWindow: () => suggestionWindow,
    getLastSuggestion: () => lastSuggestion,
    sendResult,
    sendPendingSuggestion,
    hideSuggestionWindow: () => suggestionWindow?.hide(),
    runAsk,
    showPromptsEditor,
    onSessionUpdated: () => {
      void persistCurrentSession();
    }
  });

  ipcMain.handle("face:sample", (_event, sample: FaceSample) => {
    recordFaceSample(sample);
    handleLooksStuckSample(sample);
  });

  if (FACE_WATCHER_ENABLED) {
    void startFaceWatcher({ preloadPath: preloadPath() }).catch(showStartupError);
  }
}).catch(showStartupError);

app.on("window-all-closed", () => {
  // Tray app: keep the process alive even when all transient windows close.
});

app.on("will-quit", () => {
  stopAppContextWatcher();
  stopFaceWatcher();
  globalShortcut.unregisterAll();
});
