# ClawSense V0 MVP Spec

## Decision Summary

V0 uses Electron and Claude Code CLI.

```text
Framework: Electron + TypeScript
Agent: Claude Code CLI
Auth: User's existing Claude Code login / subscription
Capture: Screenshot saved as a local file path
Trigger: Menu bar + global hotkey
UI: Bottom-right suggestion card
Optional UI: Subtle bottom-right trigger button
Log: Local JSONL
```

The key product decision is to avoid the Claude Agent SDK and Anthropic API for V0. The user wants this to run through their existing Claude Code subscription, so the first implementation should shell out to the installed `claude` CLI.

## Why CLI, Not SDK

| Option | Auth | Purpose | V0 Fit |
| --- | --- | --- | --- |
| Claude Code CLI | Uses local Claude Code login/subscription | Operate Claude Code locally | Best fit |
| Claude Agent SDK | Developer/API-oriented integration | Build embedded agent products | Later |
| Anthropic API | API key and API billing | Direct model requests, including images | Not the desired billing/auth path |

V0 should use the user's local Claude Code environment. This keeps the product aligned with the intended usage: "I already have Claude Code, so ClawSense should use that."

## Core Flow

```text
User is stuck
  -> clicks menu bar icon or presses hotkey
  -> ClawSense captures the current screen
  -> ClawSense saves screenshot locally
  -> ClawSense passes the screenshot path to Claude Code CLI
  -> Claude Code reasons about the screen
  -> ClawSense shows one next action in a bottom-right card
  -> User marks useful / wrong / retry / dismissed
```

## Product Surfaces

### P0: Menu Bar Icon

The menu bar icon is the primary V0 surface.

Menu items:

```text
Ask ClawSense
Add Note and Ask
Open Last Suggestion
Settings
Quit
```

Behavior:

- The app starts into the macOS menu bar.
- The user can trigger capture from the menu bar.
- The menu bar icon remains available after the suggestion card is dismissed.
- The app should be usable without a normal main window.
- The app should not capture the screen just by running.

### P0: Global Hotkey

The global hotkey should trigger the same flow as `Ask ClawSense`.

Default candidate:

```text
Command + Shift + Space
```

This can be changed later if it conflicts with the user's system shortcuts.

### P0: Bottom-Right Suggestion Card

The response appears as a small bottom-right card.

Card fields:

```text
Likely intent
Next action
Why
Confidence
```

Card actions:

```text
Useful
Wrong
Retry
Dismiss
```

Rules:

- Show exactly one next action.
- Do not show a long multi-option answer.
- Do not execute anything automatically.
- Keep the card dismissible and non-blocking.

### P1: Subtle Bottom-Right Trigger Button

A persistent faint button in the bottom-right is useful, but not required for the first coding pass.

Reason:

- It may require transparent, always-on-top Electron window behavior.
- Click-through and "does not get in the way" behavior need tuning.
- It is not the core validation risk.

V0 can ship with menu bar + hotkey first. Add the subtle button after the main loop works.

## Screenshot Input

V0 should avoid direct API image upload.

The screenshot should be saved locally and passed to Claude Code CLI as a file path in the prompt.

Prompt shape:

```text
このスクリーンショットを見て、ユーザーが次にやるべき1アクションだけ返してください:
[screenshot_path]

出力:
- Likely intent:
- Next action:
- Why:
- Confidence:
```

Open risk:

- Claude Code CLI must be tested to confirm whether an image file path is interpreted as an image attachment or only as text.

Fallback if CLI image path does not work:

1. Use OCR / screenshot description extraction locally.
2. Pass extracted text plus screenshot path to Claude Code CLI.
3. Defer SDK/API image upload until after the CLI path is proven insufficient.

## P0 Functional Requirements

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR1 | App runs as a menu bar app. | App icon appears in the macOS menu bar and remains available while running. |
| FR2 | User can trigger from menu bar. | `Ask ClawSense` starts the capture flow. |
| FR3 | User can trigger from hotkey. | Global hotkey starts the same capture flow as the menu item. |
| FR4 | App captures current screen. | A screenshot file is saved locally after explicit user trigger. |
| FR5 | User can add optional note. | `Add Note and Ask` opens a small text input before sending. |
| FR6 | App calls Claude Code CLI. | App passes prompt + screenshot path to local `claude` command. |
| FR7 | App receives response. | CLI output is captured and converted into a suggestion card. |
| FR8 | App shows one suggestion. | Bottom-right card displays one next action. |
| FR9 | User can provide feedback. | Useful/wrong/retry/dismiss are logged locally. |
| FR10 | App logs locally. | Trigger, response, latency, and feedback are written to JSONL. |

## P1 Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| P1-1 | Subtle bottom-right trigger button | Add after menu bar + hotkey loop works. |
| P1-2 | Context preview before send | Useful for trust, but not required for first spike. |
| P1-3 | Claude Code session resume | Use `--continue` or `--resume` after basic one-shot calls work. |
| P1-4 | Adapter boundary | Keep `ClaudeCliAdapter` swappable for SDK/OpenClaw later. |

## Non-Goals

V0 does not include:

- Claude Agent SDK integration
- Anthropic API billing
- OpenClaw routing
- Automatic action execution
- Background work logs
- Behavioral auto-triggering
- Camera or expression detection
- Persistent screen recording

## Local Log Format

Use JSONL so the first version stays simple.

Example path:

```text
~/Library/Application Support/ClawSense/events.jsonl
```

Event examples:

```json
{"type":"trigger","id":"trg_001","createdAt":"2026-04-26T00:00:00.000Z","source":"menu","screenshotPath":"/path/to/screenshot.png"}
{"type":"agent_response","triggerId":"trg_001","provider":"claude-cli","latencyMs":12800,"nextAction":"Run the failing command again with --verbose.","rawText":"..."}
{"type":"feedback","triggerId":"trg_001","feedback":"useful","createdAt":"2026-04-26T00:00:20.000Z"}
```

## First Implementation Spike

Build the smallest possible loop:

```text
1. Electron app starts into menu bar.
2. Menu item `Ask ClawSense` exists.
3. Clicking it captures a screenshot.
4. App calls `claude -p` with screenshot path in the prompt.
5. App captures stdout.
6. App shows stdout in a bottom-right card.
7. User can dismiss the card.
```

Spike success condition:

```text
From the menu bar, the user can capture the current screen,
send its file path to Claude Code CLI, and see a useful response in the app UI.
```

