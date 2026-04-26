import { randomUUID } from "node:crypto";
import { askDirection } from "./claude";
import { openInPreferredTerminal } from "./terminal";
import type { ResultPayload, SuggestionAction, Turn } from "./types";

type Session = {
  triggerId: string;
  screenshotPath: string;
  selectedLabel: string;
  turns: Turn[];
  sessionId: string;
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
  action: SuggestionAction
): ResultPayload {
  current = {
    triggerId,
    screenshotPath,
    selectedLabel: action.label,
    turns: [{ role: "user", content: action.label }],
    sessionId: randomUUID()
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
      selectedLabel: current.selectedLabel,
      turns: current.turns,
      sessionId: current.sessionId
    });

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
