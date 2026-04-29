export type TriggerSource = "menu" | "hotkey" | "button" | "looks-stuck";

export type ActionKind = "terminal" | "doc" | "code" | "search" | "general";

export type SuggestionAction = {
  id: string;
  label: string;
  kind: ActionKind;
};

export type SuggestionPayload = {
  triggerId: string;
  headline: string;
  hint: string;
  actions: SuggestionAction[];
  rawText: string;
  latencyMs: number;
  screenshotPath: string;
  pending: boolean;
  compact?: boolean;
};

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

export type ResultPayload = {
  triggerId: string;
  selectedLabel: string;
  turns: Turn[];
  pending: boolean;
};

export type FeedbackValue = "select" | "wrong" | "retry" | "dismissed";
