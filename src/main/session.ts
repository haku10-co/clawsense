import { randomUUID } from "node:crypto";
import { askDirection } from "./claude";
import type { HistoricalSession } from "./history";
import { openInPreferredTerminal } from "./terminal";
import type { OcrResult, ResultPayload, SuggestionAction, Turn } from "./types";

type Session = {
  triggerId: string;
  screenshotPath: string;
  ocr?: OcrResult | null;
  selectedLabel: string;
  turns: Turn[];
  sessionId: string;
  claudeSessionCreated: boolean;
  createdAt: string;
};

let current: Session | null = null;

function snapshot(pending: boolean): ResultPayload {
  if (!current) {
    throw new Error("No active ClawSense session");
  }

  return {
    triggerId: current.triggerId,
    selectedLabel: current.selectedLabel,
    turns: current.turns.map((turn) => ({ ...turn })),
    pending
  };
}

export function getSessionTriggerId(): string | null {
  return current?.triggerId ?? null;
}

export function clearSession(): void {
  current = null;
}

export function startSession(
  triggerId: string,
  screenshotPath: string,
  action: SuggestionAction,
  ocr?: OcrResult | null
): ResultPayload {
  current = {
    triggerId,
    screenshotPath,
    ocr,
    selectedLabel: action.label,
    turns: [{ role: "user", content: action.label }],
    sessionId: randomUUID(),
    claudeSessionCreated: false,
    createdAt: new Date().toISOString()
  };

  return snapshot(true);
}

export function appendUserTurn(message: string): ResultPayload {
  if (!current) {
    throw new Error("No active ClawSense session");
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return snapshot(false);
  }

  current.turns.push({ role: "user", content: trimmed });
  return snapshot(true);
}

export async function fetchAssistantTurn(): Promise<ResultPayload> {
  if (!current) {
    throw new Error("No active ClawSense session");
  }

  try {
    const reply = await askDirection({
      screenshotPath: current.screenshotPath,
      ocr: current.ocr,
      selectedLabel: current.selectedLabel,
      turns: current.turns,
      sessionId: current.sessionId,
      isFirstTurn: !current.claudeSessionCreated
    });

    current.claudeSessionCreated = true;
    current.turns.push({ role: "assistant", content: reply });
    return snapshot(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current.turns.push({
      role: "assistant",
      content: `回答の取得中にエラーが発生しました。\n${message}`
    });
    return snapshot(false);
  }
}

export async function openInTerminal(): Promise<{ fallback: boolean } | null> {
  if (!current) {
    return null;
  }

  const result = await openInPreferredTerminal({ sessionId: current.sessionId });
  return { fallback: result.fallback };
}

export function getSessionId(): string | null {
  return current?.sessionId ?? null;
}

export function getSessionSnapshot(): HistoricalSession | null {
  if (!current) {
    return null;
  }
  return {
    triggerId: current.triggerId,
    sessionId: current.sessionId,
    screenshotPath: current.screenshotPath,
    selectedLabel: current.selectedLabel,
    turns: current.turns.map((turn) => ({ ...turn })),
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
}

export function restoreSession(historical: HistoricalSession): ResultPayload {
  current = {
    triggerId: historical.triggerId,
    screenshotPath: historical.screenshotPath,
    ocr: null,
    selectedLabel: historical.selectedLabel,
    turns: historical.turns.map((turn) => ({ ...turn })),
    sessionId: historical.sessionId,
    claudeSessionCreated: true,
    createdAt: historical.createdAt
  };
  return snapshot(false);
}
