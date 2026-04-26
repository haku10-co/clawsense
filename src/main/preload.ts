import { contextBridge, ipcRenderer } from "electron";
import type { FeedbackValue, ResultPayload, SuggestionPayload } from "./types";

type PromptsBundle = { picker: string; direction: string };

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
  suggestionReady() {
    return ipcRenderer.invoke("suggestion:ready");
  },
  onNoteFocus(callback: () => void) {
    ipcRenderer.on("note:focus", () => callback());
  },
  retryWithNote(note: string) {
    return ipcRenderer.invoke("ask:retry-with-note", note);
  },
  sendFeedback(triggerId: string, feedback: FeedbackValue, actionId?: string) {
    return ipcRenderer.invoke("feedback:send", triggerId, feedback, actionId);
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
  resizeSuggestion(height: number) {
    return ipcRenderer.invoke("suggestion:resize", height);
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
  openSettings(): Promise<void> {
    return ipcRenderer.invoke("settings:open");
  }
});
