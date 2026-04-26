type ViewName = "suggestion" | "note";
type ViewState = "picker" | "result";
type FeedbackValue = "select" | "wrong" | "retry" | "dismissed";
type ActionKind = "terminal" | "doc" | "code" | "search" | "general";

type SuggestionAction = { id: string; label: string; kind: ActionKind };

type SuggestionPayload = {
  triggerId: string;
  headline: string;
  hint: string;
  actions: SuggestionAction[];
  rawText: string;
  latencyMs: number;
  screenshotPath: string;
  pending: boolean;
};

type Turn = { role: "user" | "assistant"; content: string };

type ResultPayload = {
  triggerId: string;
  selectedLabel: string;
  turns: Turn[];
  pending: boolean;
};

const view = document.body.dataset.view as ViewName | undefined;
const WINDOW_PADDING = 20;
const VALID_KINDS: readonly ActionKind[] = ["terminal", "doc", "code", "search", "general"];

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing renderer element: ${id}`);
  }
  return el as T;
}

function setText(id: string, value: string): void {
  byId<HTMLElement>(id).textContent = value;
}

function safeKind(kind: string): ActionKind {
  return (VALID_KINDS as readonly string[]).includes(kind) ? (kind as ActionKind) : "general";
}

function setState(state: ViewState): void {
  document.body.dataset.state = state;
}

function requestResizeToContent(): void {
  const card = document.querySelector<HTMLElement>(".suggestion-card");
  if (!card) {
    return;
  }
  const desired = Math.ceil(card.getBoundingClientRect().height) + WINDOW_PADDING;
  void window.clawSense.resizeSuggestion(desired);
}

function renderPickerActions(
  list: HTMLUListElement,
  actions: SuggestionAction[],
  pending: boolean,
  onSelect: (action: SuggestionAction) => void
): void {
  list.replaceChildren();

  if (pending) {
    for (let i = 0; i < 3; i++) {
      list.appendChild(buildPickerSkeleton());
    }
    return;
  }

  if (actions.length === 0) {
    list.appendChild(buildPickerEmpty());
    return;
  }

  for (const action of actions) {
    list.appendChild(buildActionCard({ ...action, kind: safeKind(action.kind) }, onSelect));
  }
}

function renderThread(thread: HTMLElement, turns: Turn[], pending: boolean): void {
  thread.replaceChildren();

  // Skip the very first turn (selection chip already shows it)
  const visibleTurns = turns.slice(1);

  for (const turn of visibleTurns) {
    const wrap = document.createElement("div");
    wrap.className = `turn turn-${turn.role}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble bubble-${turn.role}`;
    bubble.textContent = turn.content;

    wrap.appendChild(bubble);
    thread.appendChild(wrap);
  }

  if (pending) {
    const wrap = document.createElement("div");
    wrap.className = "turn turn-assistant";
    const bubble = document.createElement("div");
    bubble.className = "bubble bubble-assistant bubble-pending";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "thinking-dot";
      bubble.appendChild(dot);
    }
    wrap.appendChild(bubble);
    thread.appendChild(wrap);
  }

  thread.scrollTop = thread.scrollHeight;
}

function setDisabled(
  elements: NodeListOf<HTMLButtonElement> | HTMLButtonElement[],
  disabled: boolean
): void {
  elements.forEach((b) => (b.disabled = disabled));
}

function initSuggestion(): void {
  let suggestion: SuggestionPayload | null = null;
  let result: ResultPayload | null = null;
  let lastTriggerId: string | null = null;

  const status = byId<HTMLElement>("suggestion-status");
  const resultStatus = byId<HTMLElement>("result-status");
  const list = byId<HTMLUListElement>("actions");
  const pickerButtons = document.querySelectorAll<HTMLButtonElement>(
    ".suggestion-actions [data-feedback]"
  );
  const resultButtons = document.querySelectorAll<HTMLButtonElement>("[data-result-action]");
  const thread = byId<HTMLElement>("thread");
  const selectedLabelEl = byId<HTMLElement>("selected-label");
  const threadForm = byId<HTMLFormElement>("thread-form");
  const threadInput = byId<HTMLTextAreaElement>("thread-input");
  const threadSend = threadForm.querySelector<HTMLButtonElement>(".thread-send");

  const card = document.querySelector<HTMLElement>(".suggestion-card");
  if (card) {
    new ResizeObserver(() => requestResizeToContent()).observe(card);
  }

  function sendPickerFeedback(
    feedback: FeedbackValue,
    actionId?: string,
    customLabel?: string
  ): void {
    if (!suggestion) {
      void window.clawSense.dismiss();
      return;
    }

    setDisabled(pickerButtons, true);
    status.textContent =
      feedback === "retry"
        ? "やり直しています…"
        : feedback === "select"
          ? "選択を記録しています…"
          : "フィードバックを送信中…";

    window.clawSense
      .sendFeedback(suggestion.triggerId, feedback, actionId, customLabel)
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "送信できませんでした。";
        status.textContent = msg;
        setDisabled(pickerButtons, false);
      });
  }

  function renderPicker(payload: SuggestionPayload): void {
    suggestion = payload;
    setState("picker");
    document.body.dataset.pending = payload.pending ? "true" : "false";
    setText("headline", payload.headline || "提案");
    setText("hint", payload.hint || "");

    if (lastTriggerId !== payload.triggerId) {
      const noteInput = document.getElementById("picker-note-input") as HTMLInputElement | null;
      if (noteInput) {
        noteInput.value = "";
      }
      lastTriggerId = payload.triggerId;
    }

    renderPickerActions(list, payload.actions, payload.pending, (action) =>
      sendPickerFeedback("select", action.id, action.label)
    );
    status.textContent = "";
    setDisabled(pickerButtons, false);
  }

  function renderResult(payload: ResultPayload): void {
    result = payload;
    setState("result");
    selectedLabelEl.textContent = payload.selectedLabel;
    renderThread(thread, payload.turns, payload.pending);

    if (threadSend) {
      threadSend.disabled = payload.pending;
    }
    threadInput.disabled = payload.pending;
    setDisabled(resultButtons, payload.pending);
    resultStatus.textContent = payload.pending ? "ClawSense が考えています…" : "";

    if (!payload.pending) {
      threadInput.focus();
    }
  }

  setDisabled(pickerButtons, true);
  window.clawSense.onSuggestion(renderPicker);
  window.clawSense.onResult(renderResult);
  window.clawSense.onResultToast((message) => {
    resultStatus.textContent = message;
  });
  void window.clawSense.suggestionReady();

  const topClose = document.getElementById("top-close");
  if (topClose) {
    topClose.addEventListener("click", () => void window.clawSense.dismiss());
  }

  document.querySelectorAll<HTMLButtonElement>('[data-action="settings"]').forEach((button) => {
    button.addEventListener("click", () => void window.clawSense.openSettings());
  });

  const noteForm = document.getElementById("picker-note-form") as HTMLFormElement | null;
  const noteInput = document.getElementById("picker-note-input") as HTMLInputElement | null;
  if (noteForm && noteInput) {
    noteForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = noteInput.value.trim();
      void window.clawSense.retryWithNote(value);
    });
  }

  pickerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const fb = button.dataset.feedback as FeedbackValue | undefined;
      if (fb) {
        sendPickerFeedback(fb);
      }
    });
  });

  threadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!result) {
      return;
    }
    const message = threadInput.value.trim();
    if (!message) {
      return;
    }
    threadInput.value = "";
    void window.clawSense.continueChat(result.triggerId, message);
  });

  threadInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      threadForm.requestSubmit();
    }
  });

  resultButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!result) {
        return;
      }
      const action = button.dataset.resultAction;
      if (action === "terminal") {
        void window.clawSense.openInTerminal(result.triggerId);
      } else if (action === "reroll") {
        void window.clawSense.rerollPicker(result.triggerId);
      } else if (action === "dismiss") {
        void window.clawSense.dismiss();
      }
    });
  });
}

if (view === "suggestion") {
  initSuggestion();
}
