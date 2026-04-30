type ViewName = "suggestion" | "note";
type ViewState = "picker" | "result";
type FeedbackValue = "select" | "wrong" | "retry" | "dismissed";
type ActionKind = "terminal" | "doc" | "code" | "search" | "general";
type SuggestionLanguage = "ja" | "en";

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
  compact?: boolean;
};

type Turn = { role: "user" | "assistant"; content: string };

type ResultPayload = {
  triggerId: string;
  selectedLabel: string;
  turns: Turn[];
  pending: boolean;
};

const view = document.body.dataset.view as ViewName | undefined;
const VALID_KINDS: readonly ActionKind[] = ["terminal", "doc", "code", "search", "general"];
const SUGGESTION_COPY: Record<
  SuggestionLanguage,
  {
    defaultHeadline: string;
    retrying: string;
    selecting: string;
    sendingFeedback: string;
    sendFailed: string;
    resultThinking: string;
    notePlaceholder: string;
    noteLabel: string;
    wrong: string;
    retry: string;
    settings: string;
    close: string;
    selected: string;
    threadPlaceholder: string;
    send: string;
    openTerminal: string;
    reroll: string;
  }
> = {
  ja: {
    defaultHeadline: "提案",
    retrying: "やり直しています…",
    selecting: "選択を記録しています…",
    sendingFeedback: "フィードバックを送信中…",
    sendFailed: "送信できませんでした。",
    resultThinking: "ClawBrow が考えています…",
    notePlaceholder: "状況を一言（任意）— Enterで再生成",
    noteLabel: "補助メモ",
    wrong: "違う",
    retry: "再提案",
    settings: "設定",
    close: "閉じる",
    selected: "選択中",
    threadPlaceholder: "追加で聞きたいことを入力…",
    send: "送信",
    openTerminal: "ターミナルで開く",
    reroll: "別案をもらう"
  },
  en: {
    defaultHeadline: "Suggestions",
    retrying: "Trying again...",
    selecting: "Recording selection...",
    sendingFeedback: "Sending feedback...",
    sendFailed: "Could not send.",
    resultThinking: "ClawBrow is thinking...",
    notePlaceholder: "Add context (optional) - Enter to regenerate",
    noteLabel: "Context note",
    wrong: "Not right",
    retry: "Try again",
    settings: "Settings",
    close: "Close",
    selected: "Selected",
    threadPlaceholder: "Ask a follow-up...",
    send: "Send",
    openTerminal: "Open in Terminal",
    reroll: "Get another take"
  }
};

let language: SuggestionLanguage = "ja";

function copy(): (typeof SUGGESTION_COPY)[SuggestionLanguage] {
  return SUGGESTION_COPY[language];
}

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
  const suggestionCard = document.querySelector<HTMLElement>(".suggestion-card");

  function applyLanguageUi(): void {
    const c = copy();
    document.documentElement.lang = language;
    const noteInput = document.getElementById("picker-note-input") as HTMLInputElement | null;
    if (noteInput) {
      noteInput.placeholder = c.notePlaceholder;
      noteInput.setAttribute("aria-label", c.noteLabel);
    }
    const topClose = document.getElementById("top-close");
    topClose?.setAttribute("aria-label", c.close);
    document.querySelectorAll<HTMLButtonElement>('[data-action="settings"]').forEach((button) => {
      button.setAttribute("aria-label", c.settings);
    });
    document.querySelectorAll<HTMLElement>('[data-feedback="wrong"] span').forEach((el) => {
      el.textContent = c.wrong;
    });
    document.querySelectorAll<HTMLElement>('[data-feedback="retry"] span').forEach((el) => {
      el.textContent = c.retry;
    });
    const chipLabel = document.querySelector<HTMLElement>(".chip-label");
    if (chipLabel) {
      chipLabel.textContent = c.selected;
    }
    threadInput.placeholder = c.threadPlaceholder;
    threadSend?.setAttribute("aria-label", c.send);
    document.querySelectorAll<HTMLElement>('[data-result-action="terminal"] span').forEach((el) => {
      el.textContent = c.openTerminal;
    });
    document.querySelectorAll<HTMLElement>('[data-result-action="reroll"] span').forEach((el) => {
      el.textContent = c.reroll;
    });
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
        ? copy().retrying
        : feedback === "select"
          ? copy().selecting
          : copy().sendingFeedback;

    window.clawSense
      .sendFeedback(suggestion.triggerId, feedback, actionId, customLabel)
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : copy().sendFailed;
        status.textContent = msg;
        setDisabled(pickerButtons, false);
      });
  }

  function renderPicker(payload: SuggestionPayload): void {
    suggestion = payload;
    setState("picker");
    document.body.dataset.pending = payload.pending ? "true" : "false";
    document.body.dataset.compact = payload.compact ? "true" : "false";
    setText("headline", payload.headline || copy().defaultHeadline);
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
    document.body.dataset.compact = "false";
    document.body.dataset.pending = payload.pending ? "true" : "false";
    selectedLabelEl.textContent = payload.selectedLabel;
    renderThread(thread, payload.turns, payload.pending);

    if (threadSend) {
      threadSend.disabled = payload.pending;
    }
    threadInput.disabled = payload.pending;
    setDisabled(resultButtons, payload.pending);
    resultStatus.textContent = payload.pending ? copy().resultThinking : "";

    if (!payload.pending) {
      threadInput.focus();
    }
  }

  setDisabled(pickerButtons, true);
  window.clawSense.onSettingsUpdate((settings) => {
    language = settings.language;
    applyLanguageUi();
    if (document.body.dataset.state === "picker" && suggestion) {
      renderPicker(suggestion);
    } else if (document.body.dataset.state === "result" && result) {
      renderResult(result);
    }
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
  window.clawSense.onSuggestion(renderPicker);
  window.clawSense.onResult(renderResult);
  window.clawSense.onResultToast((message) => {
    resultStatus.textContent = message;
  });
  void window.clawSense.suggestionReady();

  const topClose = document.getElementById("top-close");
  if (topClose) {
    topClose.addEventListener("click", (event) => {
      event.stopPropagation();
      void window.clawSense.dismiss();
    });
  }

  const topCompact = document.getElementById("top-compact");
  if (topCompact) {
    topCompact.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.body.dataset.compact = "true";
      void window.clawSense.compact();
    });
  }

  if (suggestionCard) {
    suggestionCard.addEventListener("click", (event) => {
      if (document.body.dataset.compact !== "true") {
        return;
      }
      event.preventDefault();
      document.body.dataset.compact = "false";
      void window.clawSense.expand();
    });
  }

  document.querySelectorAll<HTMLButtonElement>('[data-action="settings"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void window.clawSense.openSettings();
    });
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
