import { contextBridge, ipcRenderer } from "electron";
import type { FeedbackValue, ResultPayload, SuggestionPayload } from "./types";
import type { FaceSample } from "./sensors/face-watcher";

type PromptsBundle = { picker: string; direction: string };
type AppLanguage = "ja" | "en";
type AppSettings = { language: AppLanguage };

contextBridge.exposeInMainWorld("clawSense", {
  onSuggestion(callback: (payload: SuggestionPayload) => void) {
    ipcRenderer.on("suggestion:update", (_event, payload: SuggestionPayload) => callback(payload));
  },
  onResult(callback: (payload: ResultPayload) => void) {
    ipcRenderer.on("result:update", (_event, payload: ResultPayload) => callback(payload));
  },
  onResultToast(callback: (message: string) => void) {
    ipcRenderer.on("result:toast", (_event, message: string) => callback(message));
  },
  onSettingsUpdate(callback: (settings: AppSettings) => void) {
    ipcRenderer.on("settings:update", (_event, settings: AppSettings) => callback(settings));
  },
  suggestionReady() {
    return ipcRenderer.invoke("suggestion:ready");
  },
  onNoteFocus(callback: () => void) {
    ipcRenderer.on("note:focus", () => callback());
  },
  retryWithNote(note: string) {
    return ipcRenderer.invoke("ask:retry-with-note", note);
  },
  sendFeedback(triggerId: string, feedback: FeedbackValue, actionId?: string, customLabel?: string) {
    return ipcRenderer.invoke("feedback:send", triggerId, feedback, actionId, customLabel);
  },
  continueChat(triggerId: string, message: string) {
    return ipcRenderer.invoke("result:continue", triggerId, message);
  },
  rerollPicker(triggerId: string) {
    return ipcRenderer.invoke("result:reroll", triggerId);
  },
  openInTerminal(triggerId: string) {
    return ipcRenderer.invoke("result:open-terminal", triggerId);
  },
  dismiss() {
    return ipcRenderer.invoke("window:dismiss");
  },
  compact() {
    return ipcRenderer.invoke("window:compact");
  },
  expand() {
    return ipcRenderer.invoke("window:expand");
  },
  readPrompts(): Promise<PromptsBundle> {
    return ipcRenderer.invoke("prompts:read");
  },
  savePrompts(bundle: PromptsBundle): Promise<void> {
    return ipcRenderer.invoke("prompts:save", bundle);
  },
  resetPrompts(): Promise<PromptsBundle> {
    return ipcRenderer.invoke("prompts:reset");
  },
  readSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke("settings:read");
  },
  saveSettings(settings: AppSettings): Promise<AppSettings> {
    return ipcRenderer.invoke("settings:save", settings);
  },
  setLanguage(language: AppLanguage): Promise<{ settings: AppSettings; prompts: PromptsBundle }> {
    return ipcRenderer.invoke("settings:set-language", language);
  },
  openSettings(): Promise<void> {
    return ipcRenderer.invoke("settings:open");
  },
  faceSample(sample: FaceSample): Promise<void> {
    return ipcRenderer.invoke("face:sample", sample);
  }
});
