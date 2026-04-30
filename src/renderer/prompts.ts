type PromptKey = "picker" | "direction";
type PromptsBundle = { picker: string; direction: string };

const HELP_BY_TAB: Record<PromptKey, string> = {
  picker:
    "利用可能な変数: {{screenshotPath}} {{triggerId}} {{noteBlock}}",
  direction:
    "利用可能な変数: {{selectedLabel}} {{screenshotPath}} {{ocrBlock}} {{transcript}}"
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
  const closeButton = pById<HTMLButtonElement>("prompts-close");
  const cancelButton = pById<HTMLButtonElement>("prompts-cancel");
  const resetButton = pById<HTMLButtonElement>("prompts-reset");
  const saveButton = pById<HTMLButtonElement>("prompts-save");

  let bundle: PromptsBundle = { picker: "", direction: "" };
  let activeTab: PromptKey = "picker";
  let dirty = false;

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
    setStatus("読み込み中…");
    try {
      bundle = await window.clawSense.readPrompts();
      dirty = false;
      renderTab();
      setStatus("");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "読み込みに失敗しました。";
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
    setStatus("保存中…");
    try {
      await window.clawSense.savePrompts(bundle);
      dirty = false;
      setStatus("保存しました。");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "保存に失敗しました。";
      setStatus(msg);
    } finally {
      saveButton.disabled = false;
    }
  });

  resetButton.addEventListener("click", async () => {
    const ok = window.confirm("プロンプトをデフォルトに戻します。現在の編集内容は失われます。");
    if (!ok) {
      return;
    }
    setStatus("リセット中…");
    try {
      bundle = await window.clawSense.resetPrompts();
      dirty = false;
      renderTab();
      setStatus("デフォルトに戻しました。");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "リセットに失敗しました。";
      setStatus(msg);
    }
  });

  function dismiss(): void {
    if (dirty) {
      const ok = window.confirm("変更を破棄して閉じますか？");
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
