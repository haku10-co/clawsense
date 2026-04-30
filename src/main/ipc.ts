import { BrowserWindow, ipcMain } from "electron";
import { message } from "./i18n";
import { logEvent } from "./logger";
import { readAllPrompts, resetPrompts, saveAllPrompts, type PromptsBundle } from "./prompts";
import { readSettings, saveSettings, type AppLanguage, type AppSettings } from "./settings";
import {
  appendUserTurn,
  clearSession,
  fetchAssistantTurn,
  getSessionTriggerId,
  openInTerminal,
  startSession
} from "./session";
import type {
  FeedbackValue,
  OcrResult,
  ResultPayload,
  SuggestionPayload,
  TriggerSource
} from "./types";

export type IpcDeps = {
  getSuggestionWindow: () => BrowserWindow | null;
  getLastSuggestion: () => SuggestionPayload | null;
  getOcrForTrigger: (triggerId: string) => OcrResult | null;
  sendResult: (payload: ResultPayload) => void;
  sendPendingSuggestion: () => void;
  hideSuggestionWindow: () => void;
  compactSuggestionWindow: () => void;
  expandSuggestionWindow: () => void;
  runAsk: (source: TriggerSource, note?: string) => Promise<void>;
  showPromptsEditor: () => void;
  onSessionUpdated?: () => void;
  onSettingsUpdated?: (settings: AppSettings) => void;
};

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle("ask:retry-with-note", (_event, note: string) => {
    void deps.runAsk("button", note.trim() || undefined);
  });

  ipcMain.handle("window:dismiss", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });

  ipcMain.handle("window:compact", () => deps.compactSuggestionWindow());

  ipcMain.handle("window:expand", () => deps.expandSuggestionWindow());

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

      const last = deps.getLastSuggestion();

      if (feedback === "select" && actionId && last?.triggerId === triggerId) {
        const action = last.actions.find((entry) => entry.id === actionId);
        if (!action) {
          return;
        }
        const trimmed = customLabel?.trim();
        const effective =
          trimmed && trimmed !== action.label ? { ...action, label: trimmed } : action;
        deps.sendResult(
          startSession(triggerId, last.screenshotPath, effective, deps.getOcrForTrigger(triggerId))
        );
        const reply = await fetchAssistantTurn();
        deps.sendResult(reply);
        deps.onSessionUpdated?.();
        return;
      }

      if (feedback === "retry") {
        clearSession();
        if (last?.triggerId === triggerId) {
          void deps.runAsk("button");
        }
        return;
      }

      clearSession();
      deps.hideSuggestionWindow();
    }
  );

  ipcMain.handle("result:continue", async (_event, triggerId: string, message: string) => {
    if (getSessionTriggerId() !== triggerId) {
      return;
    }
    deps.sendResult(appendUserTurn(message));
    const reply = await fetchAssistantTurn();
    deps.sendResult(reply);
    deps.onSessionUpdated?.();
  });

  ipcMain.handle("result:reroll", async () => {
    clearSession();
    await deps.runAsk("button");
  });

  ipcMain.handle("result:open-terminal", async (_event, triggerId: string) => {
    if (getSessionTriggerId() !== triggerId) {
      return;
    }
    const outcome = await openInTerminal();
    const win = deps.getSuggestionWindow();
    if (outcome?.fallback) {
      win?.webContents.send("result:toast", message("terminalFallbackToast"));
      return;
    }
    win?.hide();
    clearSession();
  });

  ipcMain.handle("suggestion:ready", () => deps.sendPendingSuggestion());

  ipcMain.handle("prompts:read", () => readAllPrompts());
  ipcMain.handle("prompts:save", (_event, bundle: PromptsBundle) => saveAllPrompts(bundle));
  ipcMain.handle("prompts:reset", () => resetPrompts());
  ipcMain.handle("settings:read", () => readSettings());
  ipcMain.handle("settings:save", async (_event, settings: AppSettings) => {
    const saved = await saveSettings(settings);
    deps.onSettingsUpdated?.(saved);
    return saved;
  });
  ipcMain.handle("settings:set-language", async (_event, language: AppLanguage) => {
    const saved = await saveSettings({ language });
    deps.onSettingsUpdated?.(saved);
    return { settings: saved, prompts: await readAllPrompts(saved.language) };
  });

  ipcMain.handle("settings:open", () => deps.showPromptsEditor());
}
