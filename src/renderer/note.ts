type NoteLanguage = "ja" | "en";

const NOTE_COPY: Record<
  NoteLanguage,
  {
    title: string;
    label: string;
    placeholder: string;
    cancel: string;
    ask: string;
    asking: string;
    failed: string;
  }
> = {
  ja: {
    title: "補足を追加",
    label: "メモ（任意）",
    placeholder: "状況や試したことを入力してください…",
    cancel: "キャンセル",
    ask: "ClawBrow に聞く",
    asking: "ClawBrow に聞いています…",
    failed: "送信に失敗しました。"
  },
  en: {
    title: "Add Context",
    label: "Note (optional)",
    placeholder: "Describe the situation or what you tried...",
    cancel: "Cancel",
    ask: "Ask ClawBrow",
    asking: "Asking ClawBrow...",
    failed: "Failed to send."
  }
};

function noteById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing note element: ${id}`);
  }
  return el as T;
}

(function initNote(): void {
  if (document.body.dataset.view !== "note") {
    return;
  }

  const form = noteById<HTMLFormElement>("note-form");
  const input = noteById<HTMLTextAreaElement>("note-input");
  const status = noteById<HTMLElement>("note-status");
  const cancelButton = noteById<HTMLButtonElement>("cancel-note");
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submitButton) {
    throw new Error("Missing note submit button");
  }
  const askButton = submitButton;
  let language: NoteLanguage = "ja";

  function copy(): (typeof NOTE_COPY)[NoteLanguage] {
    return NOTE_COPY[language];
  }

  function applyLanguageUi(): void {
    const c = copy();
    document.documentElement.lang = language;
    const title = document.querySelector<HTMLHeadingElement>(".note-header h1");
    if (title) {
      title.textContent = c.title;
    }
    const label = document.querySelector<HTMLLabelElement>(".note-label");
    if (label) {
      label.textContent = c.label;
    }
    input.placeholder = c.placeholder;
    cancelButton.textContent = c.cancel;
    askButton.textContent = c.ask;
  }

  function setSubmitting(submitting: boolean): void {
    input.disabled = submitting;
    askButton.disabled = submitting;
    cancelButton.disabled = submitting;
  }

  window.clawSense.onNoteFocus(() => {
    input.focus();
    input.select();
  });

  cancelButton.addEventListener("click", () => {
    void window.clawSense.dismiss();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setSubmitting(true);
    status.textContent = copy().asking;

    window.clawSense
      .retryWithNote(input.value.trim())
      .then(() => {
        input.value = "";
        status.textContent = "";
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : copy().failed;
        status.textContent = msg;
        setSubmitting(false);
        input.focus();
      });
  });

  window.clawSense
    .readSettings()
    .then((settings) => {
      language = settings.language;
      applyLanguageUi();
    })
    .catch(() => {
      applyLanguageUi();
    });

  requestAnimationFrame(() => input.focus());
})();
