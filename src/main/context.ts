import { listConnectedMcpServers, type McpServer } from "./mcp";
import { getActiveApp, type ActiveApp } from "./sensors/active-app";
import type { OcrResult } from "./types";
import { message } from "./i18n";

export type ContextBundle = {
  userNote?: string;
  activeApp?: ActiveApp;
  mcpServers?: McpServer[];
  ocr?: OcrResult | null;
  // TODO: 自動収集ソース。今はスタブ。
  // appTransitions?: string[];   // 直近5分のアプリ遷移
  // windowTitle?: string;         // frontmost ウィンドウタイトル
  // browserUrl?: string;          // frontmost ブラウザのURL
  // recentCommands?: string[];    // ~/.zsh_history 末尾 n 行など
  // clipboardSnippet?: string;    // 直近のクリップボード（許可制）
};

export type GatherContextInput = {
  userNote?: string;
};

export async function gatherContext(input: GatherContextInput): Promise<ContextBundle> {
  const [activeApp, mcpServers] = await Promise.all([
    getActiveApp().catch(() => null),
    listConnectedMcpServers().catch(() => [] as McpServer[])
  ]);

  return {
    userNote: input.userNote?.trim() || undefined,
    activeApp: activeApp ?? undefined,
    mcpServers: mcpServers.length > 0 ? mcpServers : undefined
  };
}

function renderMcpSection(servers: McpServer[]): string {
  const connected = servers.filter((s) => s.status === "connected").map((s) => s.name);
  const needsAuth = servers.filter((s) => s.status === "needs-auth").map((s) => s.name);
  const failed = servers.filter((s) => s.status === "failed").map((s) => s.name);

  const lines: string[] = [message("mcpHeader")];
  if (connected.length > 0) {
    lines.push(`- ${message("mcpConnected")}: ${connected.join(", ")}`);
  } else {
    lines.push(`- ${message("mcpConnectedEmpty")}`);
  }
  if (needsAuth.length > 0) {
    lines.push(`- ${message("mcpNeedsAuth")}: ${needsAuth.join(", ")}`);
  }
  if (failed.length > 0) {
    lines.push(`- ${message("mcpFailed")}: ${failed.join(", ")}`);
  }
  return lines.join("\n");
}

function renderOcrSection(ocr: OcrResult): string | null {
  const text = ocr.text.trim();
  if (!text) {
    return null;
  }

  const confidence =
    typeof ocr.confidence === "number" ? ` confidence=${ocr.confidence.toFixed(2)}` : "";
  const truncated = ocr.truncated ? " truncated=true" : "";
  return [
    `${message("ocrHeader")} (${ocr.engine}${confidence} elapsed=${ocr.elapsedMs}ms${truncated})`,
    message("ocrCaveat"),
    text
  ].join("\n");
}

export function renderNoteBlock(bundle: ContextBundle): string {
  const sections: string[] = [];

  if (bundle.activeApp) {
    sections.push(`${message("activeApp")}: ${bundle.activeApp.name}`);
  }

  if (bundle.userNote) {
    sections.push(`${message("userNote")}:\n${bundle.userNote}`);
  }

  if (bundle.mcpServers && bundle.mcpServers.length > 0) {
    sections.push(renderMcpSection(bundle.mcpServers));
  }

  if (bundle.ocr) {
    const ocrSection = renderOcrSection(bundle.ocr);
    if (ocrSection) {
      sections.push(ocrSection);
    }
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n${sections.join("\n\n")}\n`;
}
