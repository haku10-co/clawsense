import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import type { OcrResult } from "./types";

type HelperObservation = {
  text?: unknown;
  confidence?: unknown;
  box?: unknown;
};

type HelperResult = {
  engine?: unknown;
  text?: unknown;
  confidence?: unknown;
  observations?: unknown;
  error?: unknown;
};

export type ExtractOcrInput = {
  screenshotPath: string;
  signal?: AbortSignal;
};

const MAX_OCR_CHARS = Number(process.env.CLAWSENSE_OCR_MAX_CHARS || 12_000);
const OCR_TIMEOUT_MS = Number(process.env.CLAWSENSE_OCR_TIMEOUT_MS || 10_000);

function ocrEnabled(): boolean {
  return process.env.CLAWSENSE_OCR !== "0";
}

function helperPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "ClawSenseOCR");
  }
  return path.join(process.cwd(), "native", "bin", "ClawSenseOCR");
}

function truncateText(text: string): { text: string; truncated: boolean } {
  const max = Number.isFinite(MAX_OCR_CHARS) && MAX_OCR_CHARS > 0 ? MAX_OCR_CHARS : 12_000;
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, max), truncated: true };
}

function sanitizeObservations(value: unknown): OcrResult["observations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry: HelperObservation) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    const confidence = typeof entry.confidence === "number" ? entry.confidence : 0;
    const box = Array.isArray(entry.box) ? entry.box.filter((n) => typeof n === "number") : [];
    if (!text || box.length !== 4) {
      return [];
    }
    return [{ text, confidence, box: box as [number, number, number, number] }];
  });
}

function runHelper(binary: string, screenshotPath: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("ocr_aborted"));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const proc = spawn(binary, [screenshotPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = (): void => {
      proc.kill("SIGKILL");
      finish(() => reject(new Error("ocr_aborted")));
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(() => reject(new Error("ocr_timeout")));
    }, Number.isFinite(OCR_TIMEOUT_MS) && OCR_TIMEOUT_MS > 0 ? OCR_TIMEOUT_MS : 10_000);

    signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) {
        proc.kill("SIGKILL");
        finish(() => reject(new Error("ocr_output_too_large")));
      }
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", (error) => finish(() => reject(error)));
    proc.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error((stderr || stdout || `ocr exited with code ${code}`).slice(0, 500)));
      });
    });
  });
}

export async function extractOcrText(input: ExtractOcrInput): Promise<OcrResult | null> {
  if (!ocrEnabled() || process.platform !== "darwin") {
    return null;
  }

  const startedAt = Date.now();
  const raw = await runHelper(helperPath(), input.screenshotPath, input.signal);
  const parsed = JSON.parse(raw) as HelperResult;
  if (typeof parsed.error === "string" && parsed.error) {
    throw new Error(parsed.error);
  }

  const rawText = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!rawText) {
    return {
      engine: "apple-vision",
      text: "",
      elapsedMs: Date.now() - startedAt,
      truncated: false,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      observations: []
    };
  }

  const truncated = truncateText(rawText);
  return {
    engine: "apple-vision",
    text: truncated.text,
    elapsedMs: Date.now() - startedAt,
    truncated: truncated.truncated,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
    observations: sanitizeObservations(parsed.observations)
  };
}
