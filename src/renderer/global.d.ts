import type { FeedbackValue, ResultPayload, SuggestionPayload } from "../main/types";

type PromptsBundle = { picker: string; direction: string };

declare global {
  interface Window {
    clawSense: {
      onSuggestion(callback: (payload: SuggestionPayload) => void): void;
      onResult(callback: (payload: ResultPayload) => void): void;
      onResultToast(callback: (message: string) => void): void;
      suggestionReady(): Promise<void>;
      onNoteFocus(callback: () => void): void;
      retryWithNote(note: string): Promise<void>;
      sendFeedback(
        triggerId: string,
        feedback: FeedbackValue,
        actionId?: string,
        customLabel?: string
      ): Promise<void>;
      continueChat(triggerId: string, message: string): Promise<void>;
      rerollPicker(triggerId: string): Promise<void>;
      openInTerminal(triggerId: string): Promise<void>;
      dismiss(): Promise<void>;
      resizeSuggestion(height: number): Promise<void>;
      readPrompts(): Promise<PromptsBundle>;
      savePrompts(bundle: PromptsBundle): Promise<void>;
      resetPrompts(): Promise<PromptsBundle>;
      openSettings(): Promise<void>;
    };
  }
}

export {};
