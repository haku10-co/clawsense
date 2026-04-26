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
      const li = document.createElement("li");
      li.className = "action-skeleton";
      li.setAttribute("aria-hidden", "true");
      const line = document.createElement("span");
      line.className = "skeleton-line";
      li.appendChild(line);
      list.appendChild(li);
    }
    return;
  }

  if (actions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "提案を取得できませんでした。「再提案」をお試しください。";
    list.appendChild(empty);
    return;
  }

  for (const action of actions) {
    const item = document.createElement("li");
    item.setAttribute("role", "listitem");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-card";
    button.dataset.actionId = action.id;
    button.dataset.kind = safeKind(action.kind);

    const label = document.createElement("span");
    label.className = "action-label";
    label.textContent = action.label;

    const arrow = document.createElement("span");
    arrow.className = "action-arrow";
    arrow.setAttribute("aria-hidden", "true");

    button.append(label, arrow);
    button.addEventListener("click", () => onSelect(action));

    item.appendChild(button);
    list.appendChild(item);
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

function pickerActionButtons(list: HTMLUListElement): NodeListOf<HTMLButtonElement> {
  return list.querySelectorAll<HTMLButtonElement>(".action-card");
}

function initSuggestion(): void {
  let suggestion: SuggestionPayload | null = null;
  let result: ResultPayload | null = null;

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

  function sendPickerFeedback(feedback: FeedbackValue, actionId?: string): void {
    if (!suggestion) {
      void window.clawSense.dismiss();
      return;
    }

    setDisabled(pickerActionButtons(list), true);
    setDisabled(pickerButtons, true);
    status.textContent =
      feedback === "retry"
        ? "やり直しています…"
        : feedback === "select"
          ? "選択を記録しています…"
          : "フィードバックを送信中…";

    window.clawSense
      .sendFeedback(suggestion.triggerId, feedback, actionId)
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "送信できませんでした。";
        status.textContent = msg;
        setDisabled(pickerActionButtons(list), false);
        setDisabled(pickerButtons, false);
      });
  }

  function renderPicker(payload: SuggestionPayload): void {
    suggestion = payload;
    setState("picker");
    document.body.dataset.pending = payload.pending ? "true" : "false";
    setText("headline", payload.headline || "提案");
    setText("hint", payload.hint || "");
    renderPickerActions(list, payload.actions, payload.pending, (action) =>
      sendPickerFeedback("select", action.id)
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

  setDisabled(pickerActionButtons(list), true);
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
