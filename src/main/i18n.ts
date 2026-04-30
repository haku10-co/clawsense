import { readSettingsSync, type AppLanguage } from "./settings";

type MainMessageKey =
  | "thinkingHeadline"
  | "screenPermissionHeadline"
  | "screenPermissionDeniedHint"
  | "screenPermissionPromptHint"
  | "pickerSuccessHeadline"
  | "pickerEmptyHeadline"
  | "pickerSuccessHint"
  | "pickerEmptyHint"
  | "requestFailedHeadline"
  | "requestFailedFallbackHint"
  | "historyEmpty"
  | "menuAsk"
  | "menuOpenLast"
  | "menuHistory"
  | "menuSettings"
  | "menuDebug"
  | "menuHotkey"
  | "menuHotkeyMissing"
  | "menuOpenScreenRecording"
  | "menuOpenCamera"
  | "menuOpenFaceWatcher"
  | "menuOpenData"
  | "menuOpenLogs"
  | "menuOpenScreenshots"
  | "menuOpenLastScreenshot"
  | "menuQuit"
  | "terminalFallbackToast"
  | "looksStuckNote"
  | "ocrHeader"
  | "ocrCaveat"
  | "activeApp"
  | "userNote"
  | "mcpHeader"
  | "mcpConnected"
  | "mcpConnectedEmpty"
  | "mcpNeedsAuth"
  | "mcpFailed"
  | "transcriptUser"
  | "transcriptAssistant"
  | "claudeTimeout"
  | "claudeExecutionError";

const MESSAGES: Record<AppLanguage, Record<MainMessageKey, string>> = {
  ja: {
    thinkingHeadline: "考え中",
    screenPermissionHeadline: "画面収録の権限が必要です",
    screenPermissionDeniedHint:
      "システム設定 > プライバシーとセキュリティ > 画面収録 で ClawBrow を許可し、アプリを再起動してください。",
    screenPermissionPromptHint:
      "ダイアログが表示されたら『許可』を押してください。許可後はアプリの再起動が必要です。",
    pickerSuccessHeadline: "次にやることを選んでください",
    pickerEmptyHeadline: "提案を生成できませんでした",
    pickerSuccessHint: "いちばん近いと思うアクションをクリック",
    pickerEmptyHint: "「再提案」をお試しください",
    requestFailedHeadline: "リクエストを完了できませんでした",
    requestFailedFallbackHint: "画面収録の権限と Claude Code CLI のログイン状態をご確認ください",
    historyEmpty: "履歴なし",
    menuAsk: "ClawBrow に聞く",
    menuOpenLast: "直前の提案を開く",
    menuHistory: "履歴",
    menuSettings: "設定...",
    menuDebug: "デバッグ",
    menuHotkey: "ホットキー",
    menuHotkeyMissing: "ホットキー未登録",
    menuOpenScreenRecording: "画面収録の設定を開く",
    menuOpenCamera: "カメラの設定を開く",
    menuOpenFaceWatcher: "Face Watcher を開く",
    menuOpenData: "データフォルダを開く",
    menuOpenLogs: "ログフォルダを開く",
    menuOpenScreenshots: "スクショフォルダを開く",
    menuOpenLastScreenshot: "直前のスクショを開く",
    menuQuit: "終了",
    terminalFallbackToast: "コマンドをコピーしました — ターミナルに貼り付けてください",
    looksStuckNote: "自動検出: 直近の作業で詰まっていそうな状態が継続しています。",
    ocrHeader: "画面OCRテキスト",
    ocrCaveat:
      "注: OCRは不完全な可能性があります。正確な判断にはスクリーンショットも参照してください。",
    activeApp: "アクティブなアプリ",
    userNote: "ユーザーのメモ",
    mcpHeader: "利用可能な連携 (MCP):",
    mcpConnected: "接続済み（使える）",
    mcpConnectedEmpty: "接続済み（使える）: なし",
    mcpNeedsAuth: "認証待ち（今は使えない）",
    mcpFailed: "切断・エラー",
    transcriptUser: "ユーザー",
    transcriptAssistant: "アシスタント",
    claudeTimeout: "Claude の応答が {{seconds}} 秒以内に返ってきませんでした。",
    claudeExecutionError:
      "Claude CLI が Execution error を返しました。Claude Code CLI のログイン状態と、画面収録/カメラ権限を確認してください。"
  },
  en: {
    thinkingHeadline: "Thinking",
    screenPermissionHeadline: "Screen Recording permission is required",
    screenPermissionDeniedHint:
      "Allow ClawBrow in System Settings > Privacy & Security > Screen Recording, then restart the app.",
    screenPermissionPromptHint:
      "When macOS shows the permission dialog, click Allow. Restart the app after granting access.",
    pickerSuccessHeadline: "Choose what to do next",
    pickerEmptyHeadline: "No suggestions were generated",
    pickerSuccessHint: "Pick the action that feels closest",
    pickerEmptyHint: "Try asking again",
    requestFailedHeadline: "The request could not be completed",
    requestFailedFallbackHint:
      "Check Screen Recording permission and your Claude Code CLI login state.",
    historyEmpty: "No history",
    menuAsk: "Ask ClawBrow",
    menuOpenLast: "Open Last Suggestion",
    menuHistory: "History",
    menuSettings: "Settings...",
    menuDebug: "Debug",
    menuHotkey: "Hotkey",
    menuHotkeyMissing: "Hotkey not registered",
    menuOpenScreenRecording: "Open Screen Recording Settings",
    menuOpenCamera: "Open Camera Settings",
    menuOpenFaceWatcher: "Open Face Watcher",
    menuOpenData: "Open Data Folder",
    menuOpenLogs: "Open Logs Folder",
    menuOpenScreenshots: "Open Screenshots Folder",
    menuOpenLastScreenshot: "Open Last Screenshot",
    menuQuit: "Quit",
    terminalFallbackToast: "Command copied. Paste it into your terminal.",
    looksStuckNote: "Auto-detected: you may have been stuck on the current work for a while.",
    ocrHeader: "Screen OCR text",
    ocrCaveat:
      "Note: OCR may be incomplete. Refer to the screenshot for accurate judgment.",
    activeApp: "Active app",
    userNote: "User note",
    mcpHeader: "Available integrations (MCP):",
    mcpConnected: "Connected and usable",
    mcpConnectedEmpty: "Connected and usable: none",
    mcpNeedsAuth: "Needs authentication",
    mcpFailed: "Disconnected or failed",
    transcriptUser: "User",
    transcriptAssistant: "Assistant",
    claudeTimeout: "Claude did not respond within {{seconds}} seconds.",
    claudeExecutionError:
      "Claude CLI returned an Execution error. Check Claude Code CLI login and Screen Recording / Camera permissions."
  }
};

export function currentLanguage(): AppLanguage {
  return readSettingsSync().language;
}

export function message(key: MainMessageKey, language: AppLanguage = currentLanguage()): string {
  return MESSAGES[language][key];
}

export function messageTemplate(
  key: MainMessageKey,
  vars: Record<string, string | number>,
  language: AppLanguage = currentLanguage()
): string {
  return message(key, language).replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) =>
    vars[name] === undefined ? "" : String(vars[name])
  );
}
