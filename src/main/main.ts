import { app, BrowserWindow, Menu, Tray, globalShortcut, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { clampToScreen, loadBounds, saveBounds } from "./bounds";
import { captureScreen, SCREENSHOTS_DIR } from "./capture";
import { askClaude } from "./claude";
import { gatherContext, renderNoteBlock } from "./context";
import { getById, listRecent, saveSession, type HistoricalSession } from "./history";
import { registerIpcHandlers } from "./ipc";
import { logEvent } from "./logger";
import {
  getScreenAccessStatus,
  openScreenRecordingSettings,
  triggerScreenAccessPrompt
} from "./permissions";
import { ensurePromptsExist } from "./prompts";
import { getSessionSnapshot, restoreSession } from "./session";
import type { ResultPayload, SuggestionPayload, TriggerSource } from "./types";
import { createPromptsWindow, createSuggestionWindow, createTrayIcon } from "./windows";

let tray: Tray | null = null;
let suggestionWindow: BrowserWindow | null = null;
let promptsWindow: BrowserWindow | null = null;
let lastSuggestion: SuggestionPayload | null = null;
let pendingSuggestion: SuggestionPayload | null = null;
let cachedBounds: { x: number; y: number; width: number; height: number } | null = null;
let saveBoundsTimer: NodeJS.Timeout | null = null;
let recentHistory: HistoricalSession[] = [];

const HOTKEY = "CommandOrControl+Shift+Space";

function preloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function scheduleBoundsPersist(): void {
  if (!suggestionWindow || suggestionWindow.isDestroyed()) {
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
  lastSuggestion = payload;
  pendingSuggestion = payload;
  const win = ensureSuggestionWindow();

  win.showInactive();
  sendPendingSuggestion();
  setTimeout(sendPendingSuggestion, 100);
  setTimeout(sendPendingSuggestion, 500);
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

function showLoading(triggerId: string, screenshotPath: string): void {
  showSuggestion({
    triggerId,
    headline: "次の方向性を考えています…",
    hint: "Claude Code に提案を聞いています",
    actions: [],
    rawText: "",
    latencyMs: 0,
    screenshotPath,
    pending: true
  });
}

async function runAsk(source: TriggerSource, userNote?: string): Promise<void> {
  const triggerId = randomUUID();
  const startedAt = Date.now();

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
    return;
  }

  try {
    const screenshotPromise = captureScreen(triggerId);
    const contextPromise = gatherContext({ userNote });

    const screenshotPath = await screenshotPromise;
    showLoading(triggerId, screenshotPath);

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

    const response = await askClaude({ triggerId, screenshotPath, noteBlock });
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
    const message = error instanceof Error ? error.message : String(error);
    showSuggestion({
      triggerId,
      headline: "リクエストを完了できませんでした",
      hint: "画面収録の権限と Claude Code CLI のログイン状態をご確認ください",
      actions: [],
      rawText: message,
      latencyMs: Date.now() - startedAt,
      screenshotPath: "",
      pending: false
    });
    await logEvent({ type: "error", triggerId, message, createdAt: new Date().toISOString() });
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
  ensureSuggestionWindow().showInactive();
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
        { label: "画面収録の設定を開く", click: () => openScreenRecordingSettings() },
        { type: "separator" },
        { label: "スクショフォルダを開く", click: () => void shell.openPath(SCREENSHOTS_DIR) },
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

app.whenReady().then(async () => {
  app.dock?.hide();
  await ensurePromptsExist().catch(() => {
    /* prompts dir creation failure should not block app startup */
  });

  const stored = await loadBounds();
  cachedBounds = stored ? clampToScreen(stored) : null;

  recentHistory = await listRecent(10);

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

  globalShortcut.register(HOTKEY, () => {
    void runAsk("hotkey");
  });

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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
