export type ContextBundle = {
  userNote?: string;
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
  return {
    userNote: input.userNote?.trim() || undefined
    // TODO: ここで並列に他ソースを集める
    // recentCommands: await readZshHistoryTail(),
    // activeApp: await getFrontmostApp(),
    // ...
  };
}

export function renderNoteBlock(bundle: ContextBundle): string {
  const sections: string[] = [];

  if (bundle.userNote) {
    sections.push(`ユーザーのメモ:\n${bundle.userNote}`);
  }

  // TODO: 他ソースが揃ったら以下のように追記
  // if (bundle.activeApp) sections.push(`アクティブなアプリ: ${bundle.activeApp}`);
  // if (bundle.recentCommands?.length) sections.push(`直近のコマンド:\n${bundle.recentCommands.join("\n")}`);

  if (sections.length === 0) {
    return "";
  }

  return `\n${sections.join("\n\n")}\n`;
}
