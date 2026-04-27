import { listConnectedMcpServers, type McpServer } from "./mcp";

export type ContextBundle = {
  userNote?: string;
  mcpServers?: McpServer[];
  // TODO: 自動収集ソース。今はスタブ。
  // recentCommands?: string[];   // ~/.zsh_history 末尾 n 行など
  // activeApp?: string;           // osascript で frontmost process
  // recentFiles?: string[];       // Finder / VS Code の最近のファイル
  // clipboardSnippet?: string;    // 直近のクリップボード（許可制）
  // browserTabs?: string[];       // Safari/Chrome のアクティブタブ
};

export type GatherContextInput = {
  userNote?: string;
};

export async function gatherContext(input: GatherContextInput): Promise<ContextBundle> {
  const [mcpServers] = await Promise.all([
    listConnectedMcpServers().catch(() => [] as McpServer[])
  ]);

  return {
    userNote: input.userNote?.trim() || undefined,
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

  if (bundle.userNote) {
    sections.push(`ユーザーのメモ:\n${bundle.userNote}`);
  }

  if (bundle.mcpServers && bundle.mcpServers.length > 0) {
    sections.push(renderMcpSection(bundle.mcpServers));
  }

  // TODO: 他ソースが揃ったら以下のように追記
  // if (bundle.activeApp) sections.push(`アクティブなアプリ: ${bundle.activeApp}`);
  // if (bundle.recentCommands?.length) sections.push(`直近のコマンド:\n${bundle.recentCommands.join("\n")}`);

  if (sections.length === 0) {
    return "";
  }

  return `\n${sections.join("\n\n")}\n`;
}
