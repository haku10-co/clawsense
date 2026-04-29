import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cliEnv } from "./cli-env";
import { getClaudeBinaryOrThrow } from "./claude-binary";
import { readPrompt, render } from "./prompts";
import type { ActionKind, OcrResult, SuggestionAction, SuggestionPayload, Turn } from "./types";

const VALID_KINDS: readonly ActionKind[] = ["terminal", "doc", "code", "search", "general"];

export class ClaudeAbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "ClaudeAbortError";
  }
}

async function runClaude(
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  const binary = await getClaudeBinaryOrThrow();
  if (signal?.aborted) {
    throw new ClaudeAbortError();
  }

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const proc = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: cliEnv()
    });

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ClaudeAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        signal?.removeEventListener("abort", onAbort);
        const seconds = Math.round(timeoutMs / 1000);
        reject(new Error(`Claude の応答が ${seconds} 秒以内に返ってきませんでした。`));
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
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
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
  signal?: AbortSignal;
};

export type AskClaudeResult = Pick<
  SuggestionPayload,
  "triggerId" | "actions" | "rawText"
>;

type ClaudeJson = {
  actions?: unknown;
  is_error?: unknown;
  result?: unknown;
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
  if (!trimmed || isClaudeExecutionError(trimmed)) {
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
    if (json.is_error === true) {
      throw new Error(formatClaudeError(rawText));
    }
    const actions = normalizeActions(json.actions);
    if (actions.length > 0) {
      return actions;
    }
  }

  return fallbackActions(rawText);
}

function isClaudeExecutionError(rawText: string): boolean {
  const normalized = rawText.trim().toLowerCase();
  return (
    normalized === "execution error" ||
    normalized.startsWith("execution error\n") ||
    normalized.startsWith("execution error:") ||
    normalized.startsWith("error: execution error")
  );
}

function formatClaudeError(rawText: string): string {
  const trimmed = rawText.trim();
  if (isClaudeExecutionError(trimmed)) {
    return (
      "Claude CLI が Execution error を返しました。Claude Code CLI のログイン状態と、" +
      "画面収録/カメラ権限を確認してください。"
    );
  }
  return `Claude CLI returned an error: ${trimmed.slice(0, 500)}`;
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
    prompt,
    "--dangerously-skip-permissions",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config",
    "{\"mcpServers\":{}}",
    "--tools",
    "Read"
  ];

  const { stdout, stderr } = await runClaude(args, 180_000, input.signal);

  const rawText = stdout.trim() || stderr.trim();
  if (!rawText) {
    throw new Error("Claude CLI returned no output.");
  }

  if (isClaudeExecutionError(rawText)) {
    throw new Error(formatClaudeError(rawText));
  }

  const actions = parseClaudeOutput(rawText);
  if (actions.length === 0) {
    throw new Error(`Claude CLI returned no usable actions: ${rawText.slice(0, 500)}`);
  }

  return {
    triggerId: input.triggerId,
    actions,
    rawText
  };
}

export type AskDirectionInput = {
  screenshotPath: string;
  ocr?: OcrResult | null;
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

function renderOcrBlock(ocr?: OcrResult | null): string {
  if (!ocr?.text.trim()) {
    return "";
  }
  const confidence =
    typeof ocr.confidence === "number" ? ` confidence=${ocr.confidence.toFixed(2)}` : "";
  const truncated = ocr.truncated ? " truncated=true" : "";
  return [
    "",
    "画面OCRテキスト:",
    `engine=${ocr.engine}${confidence} elapsed=${ocr.elapsedMs}ms${truncated}`,
    "注: OCRは不完全な可能性があります。正確な判断にはスクリーンショットも参照してください。",
    ocr.text
  ].join("\n");
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
    ocrBlock: renderOcrBlock(input.ocr),
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

  const { stdout, stderr } = await runClaude(args, 360_000);

  const raw = stdout.trim() || stderr.trim();
  if (!raw) {
    throw new Error("Claude CLI returned no output.");
  }
  if (isClaudeExecutionError(raw)) {
    throw new Error(formatClaudeError(raw));
  }

  return parseJsonResult(raw);
}
