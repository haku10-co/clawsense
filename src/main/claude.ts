import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readPrompt, render } from "./prompts";
import type { ActionKind, SuggestionAction, SuggestionPayload, Turn } from "./types";

const VALID_KINDS: readonly ActionKind[] = ["terminal", "doc", "code", "search", "general"];

function runClaude(
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const proc = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        reject(new Error(`claude timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `claude exited with code ${code}\n${(stderr || stdout).slice(0, 500)}`
          )
        );
      }
    });
  });
}

export type AskClaudeInput = {
  triggerId: string;
  screenshotPath: string;
  noteBlock: string;
};

export type AskClaudeResult = Pick<
  SuggestionPayload,
  "triggerId" | "actions" | "rawText"
>;

type ClaudeJson = {
  actions?: unknown;
};

function normalizeKind(value: unknown): ActionKind {
  if (typeof value !== "string") {
    return "general";
  }

  const normalized = value.trim().toLowerCase();
  return (VALID_KINDS as readonly string[]).includes(normalized) ? (normalized as ActionKind) : "general";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeActions(value: unknown): SuggestionAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: SuggestionAction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const label = stringField(record.label);
    if (!label) {
      continue;
    }

    result.push({
      id: stringField(record.id) || randomUUID(),
      label,
      kind: normalizeKind(record.kind)
    });

    if (result.length >= 3) {
      break;
    }
  }

  return result;
}

function extractJsonObject(rawText: string): ClaudeJson | null {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1], rawText] : [rawText];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ClaudeJson;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function fallbackActions(rawText: string): SuggestionAction[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return [];
  }

  return [
    {
      id: randomUUID(),
      label: trimmed.slice(0, 80),
      kind: "general"
    }
  ];
}

function parseClaudeOutput(rawText: string): SuggestionAction[] {
  const json = extractJsonObject(rawText);
  if (json) {
    const actions = normalizeActions(json.actions);
    if (actions.length > 0) {
      return actions;
    }
  }

  return fallbackActions(rawText);
}

async function buildPrompt(input: AskClaudeInput): Promise<string> {
  const template = await readPrompt("picker");
  return render(template, {
    screenshotPath: input.screenshotPath,
    triggerId: input.triggerId,
    noteBlock: input.noteBlock
  });
}

export async function askClaude(input: AskClaudeInput): Promise<AskClaudeResult> {
  const prompt = await buildPrompt(input);
  const args = [
    "-p",
    "--dangerously-skip-permissions",
    "--allowed-tools",
    "Read",
    prompt
  ];

  const { stdout, stderr } = await runClaude(args, 120_000);

  const rawText = stdout.trim() || stderr.trim();
  if (!rawText) {
    throw new Error("Claude CLI returned no output.");
  }

  return {
    triggerId: input.triggerId,
    actions: parseClaudeOutput(rawText),
    rawText
  };
}

export type AskDirectionInput = {
  screenshotPath: string;
  selectedLabel: string;
  turns: Turn[];
  sessionId: string;
  isFirstTurn: boolean;
};

type ClaudeJsonResult = {
  result?: unknown;
  is_error?: unknown;
};

function parseJsonResult(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as ClaudeJsonResult;
    if (typeof parsed.result === "string" && parsed.result.trim().length > 0) {
      return parsed.result.trim();
    }
  } catch {
    // Not JSON, fall through.
  }
  return raw.trim();
}

async function buildDirectionPrompt(input: AskDirectionInput): Promise<string> {
  if (!input.isFirstTurn) {
    // Resuming: Claude already has the prior turns via --resume.
    // Send only the latest user message.
    for (let i = input.turns.length - 1; i >= 0; i--) {
      if (input.turns[i].role === "user") {
        return input.turns[i].content;
      }
    }
    return "";
  }

  const template = await readPrompt("direction");
  const transcript = input.turns
    .map((turn) =>
      turn.role === "user" ? `ユーザー: ${turn.content}` : `アシスタント: ${turn.content}`
    )
    .join("\n\n");

  return render(template, {
    selectedLabel: input.selectedLabel,
    screenshotPath: input.screenshotPath,
    transcript
  });
}

export async function askDirection(input: AskDirectionInput): Promise<string> {
  const prompt = await buildDirectionPrompt(input);
  const sessionFlag = input.isFirstTurn
    ? ["--session-id", input.sessionId]
    : ["--resume", input.sessionId];
  const args = [
    "-p",
    "--dangerously-skip-permissions",
    ...sessionFlag,
    "--output-format",
    "json",
    prompt
  ];

  const { stdout, stderr } = await runClaude(args, 120_000);

  const raw = stdout.trim() || stderr.trim();
  if (!raw) {
    throw new Error("Claude CLI returned no output.");
  }

  return parseJsonResult(raw);
}
