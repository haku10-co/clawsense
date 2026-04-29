import { getActiveApp, type ActiveApp } from "./active-app";

const POLL_MS = 2_000;

let timer: NodeJS.Timeout | null = null;
let currentApp: ActiveApp | null = null;
let polling = false;

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    currentApp = await getActiveApp();
  } finally {
    polling = false;
  }
}

export function startAppContextWatcher(): void {
  if (timer) return;
  void poll();
  timer = setInterval(() => void poll(), POLL_MS);
}

export function getCurrentActiveAppName(): string | null {
  return currentApp?.name ?? null;
}

export function stopAppContextWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  currentApp = null;
  polling = false;
}
