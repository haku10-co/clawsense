import { listConnectedMcpServers, type McpServer } from "./mcp";
import { getActiveApp, type ActiveApp } from "./sensors/active-app";

export type ContextBundle = {
  userNote?: string;
  activeApp?: ActiveApp;
  mcpServers?: McpServer[];
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

  const lines: string[] = ["利用可能な連携 (MCP):"];
  if (connected.length > 0) {
    lines.push(`- 接続済み（使える）: ${connected.join(", ")}`);
  } else {
    lines.push("- 接続済み（使える）: なし");
  }
  if (needsAuth.length > 0) {
    lines.push(`- 認証待ち（今は使えない）: ${needsAuth.join(", ")}`);
  }
  if (failed.length > 0) {
    lines.push(`- 切断・エラー: ${failed.join(", ")}`);
  }
  return lines.join("\n");
}

export function renderNoteBlock(bundle: ContextBundle): string {
  const sections: string[] = [];

  if (bundle.activeApp) {
    sections.push(`アクティブなアプリ: ${bundle.activeApp.name}`);
  }

  if (bundle.userNote) {
    sections.push(`ユーザーのメモ:\n${bundle.userNote}`);
  }

  if (bundle.mcpServers && bundle.mcpServers.length > 0) {
    sections.push(renderMcpSection(bundle.mcpServers));
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n${sections.join("\n\n")}\n`;
}
