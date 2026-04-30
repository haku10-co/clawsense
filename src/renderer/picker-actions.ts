/* Picker action card builders. Loaded as a separate global script
   before renderer.js in suggestion.html. */

const ICON_CHEVRON_RIGHT_SVG =
  '<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

const ICON_PENCIL_SVG =
  '<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

function pickerLanguage(): "ja" | "en" {
  return document.documentElement.lang === "en" ? "en" : "ja";
}

function buildPickerSkeleton(): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "action-skeleton";
  li.setAttribute("aria-hidden", "true");
  const line = document.createElement("span");
  line.className = "skeleton-line";
  li.appendChild(line);
  return li;
}

function buildPickerEmpty(): HTMLLIElement {
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.textContent =
    pickerLanguage() === "en"
      ? "Could not get suggestions. Try again."
      : "提案を取得できませんでした。「再提案」をお試しください。";
  return empty;
}

function buildActionCard(
  action: SuggestionAction,
  onSelect: (a: SuggestionAction) => void
): HTMLLIElement {
  const item = document.createElement("li");
  item.setAttribute("role", "listitem");

  const card = document.createElement("div");
  card.className = "action-card";
  card.dataset.actionId = action.id;
  card.dataset.kind = action.kind;
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const label = document.createElement("span");
  label.className = "action-label";
  label.textContent = action.label;

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "action-edit-button";
  editBtn.innerHTML = ICON_PENCIL_SVG;
  editBtn.setAttribute("aria-label", pickerLanguage() === "en" ? "Edit label" : "ラベルを編集");

  const arrow = document.createElement("span");
  arrow.className = "action-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.innerHTML = ICON_CHEVRON_RIGHT_SVG;

  let editing = false;

  const currentLabel = (): string => (label.textContent || "").trim() || action.label;

  const select = (): void => {
    onSelect({ ...action, label: currentLabel() });
  };

  const enterEdit = (): void => {
    editing = true;
    label.contentEditable = "true";
    card.classList.add("is-editing");
    label.focus();
    const range = document.createRange();
    range.selectNodeContents(label);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const exitEdit = (): void => {
    editing = false;
    label.contentEditable = "false";
    card.classList.remove("is-editing");
  };

  editBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (editing) {
      exitEdit();
      label.blur();
    } else {
      enterEdit();
    }
  });

  label.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      exitEdit();
      select();
    } else if (event.key === "Escape") {
      event.preventDefault();
      label.textContent = action.label;
      exitEdit();
      label.blur();
    }
  });

  label.addEventListener("blur", () => {
    if (editing) {
      exitEdit();
    }
  });

  card.addEventListener("click", (event) => {
    if (editing) {
      return;
    }
    const target = event.target as Node | null;
    if (target && editBtn.contains(target)) {
      return;
    }
    select();
  });

  card.addEventListener("keydown", (event) => {
    if (editing) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });

  card.append(label, editBtn, arrow);
  item.appendChild(card);
  return item;
}
