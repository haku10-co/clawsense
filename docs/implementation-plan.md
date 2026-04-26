# ClawSense Implementation Plan

## V0 Coding Plan

Current target:

```text
Electron menu bar app
  -> Ask ClawSense
  -> Capture screenshot
  -> Send screenshot path to Claude Code CLI
  -> Show one bottom-right suggestion card
  -> Log feedback locally
```

## Work Breakdown

### 1. App Shell

Owner: main integration

- Electron + TypeScript project setup
- App starts into menu bar
- Menu actions: Ask, Add Note and Ask, Open Last Suggestion, Settings, Quit
- Global hotkey: `CommandOrControl+Shift+Space`
- Dock hidden on macOS

### 2. Main Services

Owner: main-process worker

- `captureScreen(triggerId)`
- `askClaude({ triggerId, screenshotPath, note })`
- `logEvent(event)`

### 3. Renderer UI

Owner: renderer worker

- Bottom-right suggestion card
- Note input card
- Feedback buttons
- Stable compact UI

### 4. Integration

Owner: main integration

- IPC wiring
- Loading and error states
- Retry behavior
- TypeScript build
- Local run verification

## Acceptance Criteria

- App can start with `npm start`.
- Menu bar icon appears.
- `Ask ClawSense` captures a screenshot after explicit click.
- The app calls local `claude` CLI.
- The Claude response appears in a bottom-right card.
- Useful/wrong/retry/dismiss feedback is written to JSONL.

## Known Risks

- Claude Code CLI may not treat an image path as an image attachment.
- macOS screen capture may require Screen Recording permission.
- Electron tray icon behavior may differ before packaging.
- Global hotkey may conflict with existing system shortcuts.

