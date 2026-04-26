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
    status.textContent = "ClawSense に聞いています…";

    window.clawSense
      .submitNote(input.value.trim())
      .then(() => {
        input.value = "";
        status.textContent = "";
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "送信に失敗しました。";
        status.textContent = msg;
        setSubmitting(false);
        input.focus();
      });
  });

  requestAnimationFrame(() => input.focus());
})();
