import { BrowserWindow, nativeImage, screen } from "electron";
import path from "node:path";

function rendererPath(fileName: string): string {
  return path.join(__dirname, "..", "..", "src", "renderer", fileName);
}

export function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#111827"/>
      <path d="M9 16c0-4 3-7 7-7s7 3 7 7-3 7-7 7-7-3-7-7z" fill="#f9fafb"/>
      <path d="M13 16h6M16 13v6" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
}

type WindowOptions = {
  preloadPath: string;
  onClosed: () => void;
  onLoaded?: () => void;
  onDomReady?: () => void;
};

export function createSuggestionWindow(opts: WindowOptions): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 380;
  const margin = 24;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + display.workArea.width - width - margin),
    y: Math.round(display.workArea.y + display.workArea.height - height - margin),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
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

  const display = screen.getPrimaryDisplay();
  const margin = 24;
  const minHeight = 220;
  const maxHeight = Math.max(minHeight, display.workArea.height - margin * 2);
  const clamped = Math.round(
    Math.min(
      Math.max(Number.isFinite(requestedHeight) ? requestedHeight : minHeight, minHeight),
      maxHeight
    )
  );

  const { width } = win.getBounds();
  const x = Math.round(display.workArea.x + display.workArea.width - width - margin);
  const y = Math.round(display.workArea.y + display.workArea.height - clamped - margin);

  win.setBounds({ x, y, width, height: clamped }, false);
}
