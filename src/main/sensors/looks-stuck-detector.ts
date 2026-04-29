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

export type LooksStuckConfig = {
  windowMs: number;
  minSpanMs: number;
  cooldownMs: number;
  scoreThreshold: number;
  minSamples: number;
  minVisibleRatio: number;
  minCalibratedRatio: number;
  minOverRatio: number;
  minP75Score: number;
  minAppStability: number;
};

type TimedSample = {
  ts: number;
  sample: FaceSample;
  activeAppName: string | null;
};

function envNumber(name: string, fallback: number, opts: { min?: number; max?: number } = {}): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(opts.max ?? value, Math.max(opts.min ?? value, value));
}

const CONFIG: LooksStuckConfig = {
  windowMs: envNumber("CLAWSENSE_STUCK_WINDOW_MS", 8_000, { min: 2_000 }),
  minSpanMs: envNumber("CLAWSENSE_STUCK_MIN_SPAN_MS", 5_000, { min: 1_000 }),
  cooldownMs: envNumber("CLAWSENSE_STUCK_COOLDOWN_MS", 90_000, { min: 10_000 }),
  scoreThreshold: envNumber("CLAWSENSE_STUCK_SCORE_THRESHOLD", 0.32, { min: 0, max: 1 }),
  minSamples: envNumber("CLAWSENSE_STUCK_MIN_SAMPLES", 5, { min: 2 }),
  minVisibleRatio: envNumber("CLAWSENSE_STUCK_MIN_VISIBLE_RATIO", 0.6, { min: 0, max: 1 }),
  minCalibratedRatio: envNumber("CLAWSENSE_STUCK_MIN_CALIBRATED_RATIO", 0.4, {
    min: 0,
    max: 1
  }),
  minOverRatio: envNumber("CLAWSENSE_STUCK_MIN_OVER_RATIO", 0.25, { min: 0, max: 1 }),
  minP75Score: envNumber("CLAWSENSE_STUCK_MIN_P75_SCORE", 0.28, { min: 0, max: 1 }),
  minAppStability: envNumber("CLAWSENSE_STUCK_MIN_APP_STABILITY", 0.45, { min: 0, max: 1 })
};

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
  if (state.samples < CONFIG.minSamples) return "few_samples";
  if (state.windowMs < CONFIG.minSpanMs) return "short_window";
  if (state.visibleRatio < CONFIG.minVisibleRatio) return "low_visibility";
  if (state.calibratedRatio < CONFIG.minCalibratedRatio) return "calibrating";
  if (state.appStability < CONFIG.minAppStability) return "app_switching";
  if (state.overRatio < CONFIG.minOverRatio) return "not_sustained";
  if (state.p75Score < CONFIG.minP75Score) return "weak_score";
  return null;
}

export function recordLooksStuckSample(
  sample: FaceSample,
  context: LooksStuckContext,
  now = Date.now()
): LooksStuckState {
  samples.push({ ts: now, sample, activeAppName: context.activeAppName });
  samples = samples.filter((entry) => entry.ts >= now - CONFIG.windowMs);

  const first = samples[0]?.ts ?? now;
  const scores = samples.map((entry) => scoreOf(entry.sample));
  const visible = samples.filter((entry) => entry.sample.faceVisible).length;
  const calibrated = samples.filter((entry) => entry.sample.calibrated !== false).length;
  const over = scores.filter((score) => score >= CONFIG.scoreThreshold).length;
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
  state.triggerable = state.candidate && now - lastTriggerAt >= CONFIG.cooldownMs;
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

export function getLooksStuckConfig(): LooksStuckConfig {
  return { ...CONFIG };
}
