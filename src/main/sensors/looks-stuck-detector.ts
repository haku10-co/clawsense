import type { FaceSample } from "./face-watcher";

export type LooksStuckContext = {
  activeAppName: string | null;
  blocked: boolean;
};

export type LooksStuckState = {
  candidate: boolean;
  triggerable: boolean;
  reason: string;
  windowMs: number;
  samples: number;
  visibleRatio: number;
  calibratedRatio: number;
  overRatio: number;
  avgScore: number;
  p75Score: number;
  maxScore: number;
  appStability: number;
  activeAppName: string | null;
};

type TimedSample = {
  ts: number;
  sample: FaceSample;
  activeAppName: string | null;
};

const WINDOW_MS = 12_000;
const MIN_SPAN_MS = 9_000;
const COOLDOWN_MS = 8 * 60_000;
const SCORE_THRESHOLD = 0.5;
const MIN_VISIBLE_RATIO = 0.8;
const MIN_CALIBRATED_RATIO = 0.8;
const MIN_OVER_RATIO = 0.55;
const MIN_P75_SCORE = 0.48;
const MIN_APP_STABILITY = 0.7;

let samples: TimedSample[] = [];
let lastTriggerAt = 0;

function scoreOf(sample: FaceSample): number {
  return sample.fusedScore ?? sample.score;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}

function appStability(window: TimedSample[]): { ratio: number; name: string | null } {
  const counts = new Map<string, number>();
  for (const entry of window) {
    if (!entry.activeAppName) continue;
    counts.set(entry.activeAppName, (counts.get(entry.activeAppName) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return { ratio: 1, name: null };
  }
  let bestName: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestName = name;
      bestCount = count;
    }
  }
  return { ratio: bestCount / window.length, name: bestName };
}

function blockedReason(state: LooksStuckState, blocked: boolean): string | null {
  if (blocked) return "blocked";
  if (state.samples < 8) return "few_samples";
  if (state.windowMs < MIN_SPAN_MS) return "short_window";
  if (state.visibleRatio < MIN_VISIBLE_RATIO) return "low_visibility";
  if (state.calibratedRatio < MIN_CALIBRATED_RATIO) return "calibrating";
  if (state.appStability < MIN_APP_STABILITY) return "app_switching";
  if (state.overRatio < MIN_OVER_RATIO) return "not_sustained";
  if (state.p75Score < MIN_P75_SCORE) return "weak_score";
  return null;
}

export function recordLooksStuckSample(
  sample: FaceSample,
  context: LooksStuckContext,
  now = Date.now()
): LooksStuckState {
  samples.push({ ts: now, sample, activeAppName: context.activeAppName });
  samples = samples.filter((entry) => entry.ts >= now - WINDOW_MS);

  const first = samples[0]?.ts ?? now;
  const scores = samples.map((entry) => scoreOf(entry.sample));
  const visible = samples.filter((entry) => entry.sample.faceVisible).length;
  const calibrated = samples.filter((entry) => entry.sample.calibrated !== false).length;
  const over = scores.filter((score) => score >= SCORE_THRESHOLD).length;
  const app = appStability(samples);
  const state: LooksStuckState = {
    candidate: false,
    triggerable: false,
    reason: "unknown",
    windowMs: now - first,
    samples: samples.length,
    visibleRatio: samples.length ? visible / samples.length : 0,
    calibratedRatio: samples.length ? calibrated / samples.length : 0,
    overRatio: samples.length ? over / samples.length : 0,
    avgScore: samples.length ? scores.reduce((acc, score) => acc + score, 0) / samples.length : 0,
    p75Score: quantile(scores, 0.75),
    maxScore: scores.length ? Math.max(...scores) : 0,
    appStability: app.ratio,
    activeAppName: app.name
  };

  const reason = blockedReason(state, context.blocked);
  state.candidate = reason === null;
  state.reason = reason ?? "candidate";
  state.triggerable = state.candidate && now - lastTriggerAt >= COOLDOWN_MS;
  if (state.candidate && !state.triggerable) {
    state.reason = "cooldown";
  }
  return state;
}

export function markLooksStuckTriggered(now = Date.now()): void {
  lastTriggerAt = now;
}

export function resetLooksStuckDetector(): void {
  samples = [];
  lastTriggerAt = 0;
}
