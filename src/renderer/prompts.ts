type PromptKey = "picker" | "direction";
type PromptsBundle = { picker: string; direction: string };
type PromptsLanguage = "ja" | "en";
type PromptsSettings = { language: PromptsLanguage };

const HELP_BY_TAB: Record<PromptKey, string> = {
  picker:
    "利用可能な変数: {{screenshotPath}} {{triggerId}} {{noteBlock}}",
  direction:
    "利用可能な変数: {{selectedLabel}} {{screenshotPath}} {{ocrBlock}} {{transcript}}"
};

const PROMPTS_COPY: Record<
  PromptsLanguage,
  {
    title: string;
    closeLabel: string;
    languageLabel: string;
    promptsTitle: string;
    promptsDescription: string;
    pickerTab: string;
    directionTab: string;
    loading: string;
    loadFailed: string;
    saving: string;
    saved: string;
    saveFailed: string;
    resetConfirm: string;
    resetting: string;
    resetDone: string;
    resetFailed: string;
    discardConfirm: string;
    resetButton: string;
    cancelButton: string;
    saveButton: string;
  }
> = {
  ja: {
    title: "設定",
    closeLabel: "閉じる",
    languageLabel: "言語",
    promptsTitle: "プロンプト",
    promptsDescription: "選択中の言語でClaudeに渡す指示を編集します。",
    pickerTab: "3提案プロンプト",
    directionTab: "追加質問プロンプト",
    loading: "読み込み中…",
    loadFailed: "読み込みに失敗しました。",
    saving: "保存中…",
    saved: "保存しました。",
    saveFailed: "保存に失敗しました。",
    resetConfirm: "プロンプトをデフォルトに戻します。現在の編集内容は失われます。",
    resetting: "リセット中…",
    resetDone: "デフォルトに戻しました。",
    resetFailed: "リセットに失敗しました。",
    discardConfirm: "変更を破棄して閉じますか？",
    resetButton: "デフォルトに戻す",
    cancelButton: "キャンセル",
    saveButton: "保存"
  },
  en: {
    title: "Settings",
    closeLabel: "Close",
    languageLabel: "Language",
    promptsTitle: "Prompts",
    promptsDescription: "Edit the instructions sent to Claude for the selected language.",
    pickerTab: "Suggestion Prompt",
    directionTab: "Follow-up Prompt",
    loading: "Loading...",
    loadFailed: "Failed to load.",
    saving: "Saving...",
    saved: "Saved.",
    saveFailed: "Failed to save.",
    resetConfirm: "Reset prompts to defaults? Current edits will be lost.",
    resetting: "Resetting...",
    resetDone: "Reset to defaults.",
    resetFailed: "Failed to reset.",
    discardConfirm: "Discard changes and close?",
    resetButton: "Reset to Defaults",
    cancelButton: "Cancel",
    saveButton: "Save"
  }
};

function pById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing prompts element: ${id}`);
  }
  return el as T;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function helpHtml(tab: PromptKey): string {
  const text = HELP_BY_TAB[tab];
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => `<code>{{${escapeHtml(name)}}}</code>`);
}

(function initPrompts(): void {
  if (document.body.dataset.view !== "prompts") {
    return;
  }

  const form = pById<HTMLFormElement>("prompts-form");
  const textarea = pById<HTMLTextAreaElement>("prompt-textarea");
  const help = pById<HTMLElement>("prompts-help");
  const status = pById<HTMLElement>("prompts-status");
  const tabs = document.querySelectorAll<HTMLButtonElement>(".prompts-tab");
  const languageSelect = pById<HTMLSelectElement>("language-select");
  const closeButton = pById<HTMLButtonElement>("prompts-close");
  const cancelButton = pById<HTMLButtonElement>("prompts-cancel");
  const resetButton = pById<HTMLButtonElement>("prompts-reset");
  const saveButton = pById<HTMLButtonElement>("prompts-save");

  let bundle: PromptsBundle = { picker: "", direction: "" };
  let settings: PromptsSettings = { language: "ja" };
  let activeTab: PromptKey = "picker";
  let dirty = false;

  function copy(): (typeof PROMPTS_COPY)[PromptsLanguage] {
    return PROMPTS_COPY[settings.language];
  }

  function setText(id: string, value: string): void {
    pById<HTMLElement>(id).textContent = value;
  }

  function applyLanguageUi(): void {
    const c = copy();
    document.documentElement.lang = settings.language;
    setText("settings-title", c.title);
    closeButton.setAttribute("aria-label", c.closeLabel);
    setText("language-label", c.languageLabel);
    setText("prompts-title", c.promptsTitle);
    setText("prompts-description", c.promptsDescription);
    document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n as "pickerTab" | "directionTab" | undefined;
      if (key) {
        node.textContent = c[key];
      }
    });
    textarea.placeholder = c.loading;
    resetButton.textContent = c.resetButton;
    cancelButton.textContent = c.cancelButton;
    saveButton.textContent = c.saveButton;
    languageSelect.value = settings.language;
    help.innerHTML = helpHtml(activeTab);
  }

  function renderTab(): void {
    textarea.value = bundle[activeTab];
    help.innerHTML = helpHtml(activeTab);
    tabs.forEach((tab) => {
      const tabKey = tab.dataset.tab as PromptKey | undefined;
      const isActive = tabKey === activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function captureCurrent(): void {
    bundle = { ...bundle, [activeTab]: textarea.value };
  }

  function setStatus(message: string): void {
    status.textContent = message;
  }

  async function load(): Promise<void> {
    setStatus(copy().loading);
    try {
      settings = await window.clawSense.readSettings();
      applyLanguageUi();
      bundle = await window.clawSense.readPrompts();
      dirty = false;
      renderTab();
      setStatus("");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : copy().loadFailed;
      setStatus(msg);
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabKey = tab.dataset.tab as PromptKey | undefined;
      if (!tabKey || tabKey === activeTab) {
        return;
      }
      captureCurrent();
      activeTab = tabKey;
      renderTab();
    });
  });

  textarea.addEventListener("input", () => {
    dirty = true;
    setStatus("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    captureCurrent();
    saveButton.disabled = true;
    setStatus(copy().saving);
    try {
      await window.clawSense.savePrompts(bundle);
      dirty = false;
      setStatus(copy().saved);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : copy().saveFailed;
      setStatus(msg);
    } finally {
      saveButton.disabled = false;
    }
  });

  languageSelect.addEventListener("change", async () => {
    const language = languageSelect.value === "en" ? "en" : "ja";
    if (language === settings.language) {
      return;
    }
    if (dirty) {
      const ok = window.confirm(copy().discardConfirm);
      if (!ok) {
        languageSelect.value = settings.language;
        return;
      }
    }
    setStatus(copy().loading);
    languageSelect.disabled = true;
    try {
      const next = await window.clawSense.setLanguage(language);
      settings = next.settings;
      bundle = next.prompts;
      dirty = false;
      applyLanguageUi();
      renderTab();
      setStatus("");
    } catch (error: unknown) {
      languageSelect.value = settings.language;
      const msg = error instanceof Error ? error.message : copy().loadFailed;
      setStatus(msg);
    } finally {
      languageSelect.disabled = false;
    }
  });

  resetButton.addEventListener("click", async () => {
    const ok = window.confirm(copy().resetConfirm);
    if (!ok) {
      return;
    }
    setStatus(copy().resetting);
    try {
      bundle = await window.clawSense.resetPrompts();
      dirty = false;
      renderTab();
      setStatus(copy().resetDone);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : copy().resetFailed;
      setStatus(msg);
    }
  });

  function dismiss(): void {
    if (dirty) {
      const ok = window.confirm(copy().discardConfirm);
      if (!ok) {
        return;
      }
    }
    void window.clawSense.dismiss();
  }

  closeButton.addEventListener("click", dismiss);
  cancelButton.addEventListener("click", dismiss);

  void load();
})();
