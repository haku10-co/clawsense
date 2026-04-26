import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { captureScreen } from "./capture";
import { askClaude } from "./claude";
import { gatherContext, renderNoteBlock } from "./context";
import { logEvent } from "./logger";
import {
  ensurePromptsExist,
  readAllPrompts,
  resetPrompts,
  saveAllPrompts,
  type PromptsBundle
} from "./prompts";
import {
  appendUserTurn,
  clearSession,
  fetchAssistantTurn,
  getSessionTriggerId,
  openInTerminal,
  startSession
} from "./session";
import type { FeedbackValue, ResultPayload, SuggestionPayload, TriggerSource } from "./types";
import {
  applyResize,
  createPromptsWindow,
  createSuggestionWindow,
  createTrayIcon
} from "./windows";

let tray: Tray | null = null;
let suggestionWindow: BrowserWindow | null = null;
let promptsWindow: BrowserWindow | null = null;
let lastSuggestion: SuggestionPayload | null = null;
let pendingSuggestion: SuggestionPayload | null = null;

const HOTKEY = "CommandOrControl+Shift+Space";

function preloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function ensureSuggestionWindow(): BrowserWindow {
  if (suggestionWindow && !suggestionWindow.isDestroyed()) {
    return suggestionWindow;
  }

  suggestionWindow = createSuggestionWindow({
    preloadPath: preloadPath(),
    onClosed: () => {
      suggestionWindow = null;
    },
    onLoaded: sendPendingSuggestion,
    onDomReady: sendPendingSuggestion
  });

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

  try {
    const screenshotPath = await captureScreen(triggerId);
    showLoading(triggerId, screenshotPath);

    const context = await gatherContext({ userNote });
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
      headline: response.actions.length > 0 ? "次にやることを選んでください" : "提案を生成できませんでした",
      hint: response.actions.length > 0 ? "いちばん近いと思うアクションをクリック" : "「再提案」をお試しください",
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

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: "ClawSense に聞く", click: () => void runAsk("menu") },
    {
      label: "直前の提案を開く",
      enabled: Boolean(lastSuggestion),
      click: () => lastSuggestion && showSuggestion(lastSuggestion)
    },
    { type: "separator" },
    { label: "プロンプトを編集...", click: () => showPromptsEditor() },
    { label: "終了", click: () => app.quit() }
  ]);
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu());
}

async function handleSelectAction(
  triggerId: string,
  actionId: string,
  customLabel?: string
): Promise<void> {
  const action = lastSuggestion?.actions.find((entry) => entry.id === actionId);
  if (!lastSuggestion || lastSuggestion.triggerId !== triggerId || !action) {
    return;
  }

  const trimmed = customLabel?.trim();
  const effective =
    trimmed && trimmed !== action.label ? { ...action, label: trimmed } : action;

  sendResult(startSession(triggerId, lastSuggestion.screenshotPath, effective));
  const reply = await fetchAssistantTurn();
  sendResult(reply);
}

app.whenReady().then(async () => {
  app.dock?.hide();
  await ensurePromptsExist().catch(() => {
    /* prompts dir creation failure should not block app startup */
  });

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

  ipcMain.handle("ask:retry-with-note", (_event, note: string) => {
    void runAsk("button", note.trim() || undefined);
  });

  ipcMain.handle("window:dismiss", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });

  ipcMain.handle(
    "feedback:send",
    async (
      _event,
      triggerId: string,
      feedback: FeedbackValue,
      actionId?: string,
      customLabel?: string
    ) => {
      await logEvent({
        type: "feedback",
        triggerId,
        feedback,
        actionId,
        customLabel,
        createdAt: new Date().toISOString()
      });

      if (feedback === "select" && actionId) {
        await handleSelectAction(triggerId, actionId, customLabel);
        return;
      }

      if (feedback === "retry") {
        clearSession();
        if (lastSuggestion?.triggerId === triggerId) {
          void runAsk("button");
        }
        return;
      }

      clearSession();
      suggestionWindow?.hide();
    }
  );

  ipcMain.handle("result:continue", async (_event, triggerId: string, message: string) => {
    if (getSessionTriggerId() !== triggerId) {
      return;
    }

    sendResult(appendUserTurn(message));
    const reply = await fetchAssistantTurn();
    sendResult(reply);
  });

  ipcMain.handle("result:reroll", async () => {
    clearSession();
    await runAsk("button");
  });

  ipcMain.handle("result:open-terminal", async (_event, triggerId: string) => {
    if (getSessionTriggerId() !== triggerId) {
      return;
    }

    const outcome = await openInTerminal();

    if (outcome?.fallback) {
      suggestionWindow?.webContents.send(
        "result:toast",
        "コマンドをコピーしました — ターミナルに貼り付けてください"
      );
      return;
    }

    suggestionWindow?.hide();
    clearSession();
  });

  ipcMain.handle("suggestion:ready", () => sendPendingSuggestion());
  ipcMain.handle("suggestion:resize", (_e, h: number) =>
    suggestionWindow && applyResize(suggestionWindow, h)
  );

  ipcMain.handle("prompts:read", () => readAllPrompts());
  ipcMain.handle("prompts:save", (_e, bundle: PromptsBundle) => saveAllPrompts(bundle));
  ipcMain.handle("prompts:reset", () => resetPrompts());
  ipcMain.handle("settings:open", () => showPromptsEditor());
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
