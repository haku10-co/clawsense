import { BrowserWindow, nativeImage, screen } from "electron";
import path from "node:path";

function rendererPath(fileName: string): string {
  return path.join(__dirname, "..", "..", "src", "renderer", fileName);
}

function trayIconPath(fileName: string): string {
  return path.join(__dirname, "..", "..", "assets", "tray", fileName);
}

export function createTrayIcon(): Electron.NativeImage {
  const image = nativeImage.createFromPath(trayIconPath("BrowTemplate.png"));
  image.setTemplateImage(true);
  return image;
}

export type SuggestionBounds = { x: number; y: number; width: number; height: number };

const SUGGESTION_WIDTH = 420;
const SUGGESTION_HEIGHT = 380;
const SUGGESTION_MIN_WIDTH = 360;
const SUGGESTION_MIN_HEIGHT = 280;
const SUGGESTION_MARGIN = 24;
const DOCK_INDICATOR_SIZE = 56;

function defaultSuggestionBounds(): SuggestionBounds {
  const display = screen.getPrimaryDisplay();
  return {
    width: SUGGESTION_WIDTH,
    height: SUGGESTION_HEIGHT,
    x: Math.round(display.workArea.x + display.workArea.width - SUGGESTION_WIDTH - SUGGESTION_MARGIN),
    y: Math.round(display.workArea.y + display.workArea.height - SUGGESTION_HEIGHT - SUGGESTION_MARGIN)
  };
}

function usableSuggestionBounds(bounds: SuggestionBounds | null | undefined): SuggestionBounds {
  if (!bounds || bounds.width < SUGGESTION_MIN_WIDTH || bounds.height < 220) {
    return defaultSuggestionBounds();
  }
  return bounds;
}

type SuggestionWindowOptions = {
  preloadPath: string;
  onClosed: () => void;
  onLoaded?: () => void;
  onDomReady?: () => void;
  initialBounds?: SuggestionBounds | null;
};

export function createSuggestionWindow(opts: SuggestionWindowOptions): BrowserWindow {
  const bounds = usableSuggestionBounds(opts.initialBounds);

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: SUGGESTION_MIN_WIDTH,
    minHeight: SUGGESTION_MIN_HEIGHT,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    hasShadow: true,
    webPreferences: { preload: opts.preloadPath }
  });

  win.loadFile(rendererPath("suggestion.html"));
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  if (opts.onLoaded) {
    win.webContents.on("did-finish-load", opts.onLoaded);
  }
  if (opts.onDomReady) {
    win.webContents.on("dom-ready", opts.onDomReady);
  }
  win.on("closed", opts.onClosed);

  return win;
}

export function applySuggestionPanelBounds(
  win: BrowserWindow,
  preferredBounds?: SuggestionBounds | null
): void {
  if (win.isDestroyed()) {
    return;
  }

  const current = win.getBounds();
  const target = usableSuggestionBounds(preferredBounds ?? current);
  win.setMinimumSize(SUGGESTION_MIN_WIDTH, SUGGESTION_MIN_HEIGHT);
  win.setResizable(true);
  win.setBounds(target, false);
}

export function applyDockIndicator(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const x = Math.round(
    display.workArea.x + display.workArea.width - DOCK_INDICATOR_SIZE - SUGGESTION_MARGIN
  );
  const y = Math.round(
    display.workArea.y + display.workArea.height - DOCK_INDICATOR_SIZE - SUGGESTION_MARGIN
  );

  win.setMinimumSize(DOCK_INDICATOR_SIZE, DOCK_INDICATOR_SIZE);
  win.setResizable(false);
  win.setBounds({ x, y, width: DOCK_INDICATOR_SIZE, height: DOCK_INDICATOR_SIZE }, false);
}

export function createNoteWindow(opts: { preloadPath: string; onClosed: () => void }): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 220;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + display.workArea.width - width - 24),
    y: Math.round(display.workArea.y + display.workArea.height - height - 24),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: { preload: opts.preloadPath }
  });

  win.loadFile(rendererPath("note.html"));
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.on("closed", opts.onClosed);

  return win;
}

export function createPromptsWindow(opts: { preloadPath: string; onClosed: () => void }): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const width = 540;
  const height = 520;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: { preload: opts.preloadPath }
  });

  win.loadFile(rendererPath("prompts.html"));
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("closed", opts.onClosed);

  return win;
}

export function applyResize(win: BrowserWindow, requestedHeight: number): void {
  if (win.isDestroyed()) {
    return;
  }

  win.setMinimumSize(SUGGESTION_MIN_WIDTH, SUGGESTION_MIN_HEIGHT);
  win.setResizable(true);

  const display = screen.getPrimaryDisplay();
  const minHeight = 220;
  const maxHeight = Math.max(minHeight, display.workArea.height - SUGGESTION_MARGIN * 2);
  const clamped = Math.round(
    Math.min(
      Math.max(Number.isFinite(requestedHeight) ? requestedHeight : minHeight, minHeight),
      maxHeight
    )
  );

  const { width: currentWidth } = win.getBounds();
  const width = Math.max(currentWidth, SUGGESTION_MIN_WIDTH);
  const x = Math.round(display.workArea.x + display.workArea.width - width - SUGGESTION_MARGIN);
  const y = Math.round(display.workArea.y + display.workArea.height - clamped - SUGGESTION_MARGIN);

  win.setBounds({ x, y, width, height: clamped }, false);
}
