# ClawSense MVP Research

## Recommendation

Use Electron for V0.

```text
Electron desktop app
  -> Menu bar app
  -> Global shortcut
  -> Screenshot capture
  -> Small overlay suggestion card
  -> Claude Code bridge
```

Final V0 direction:

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

Implementation spec: [mvp-spec.md](mvp-spec.md)

The MVP goal is not to build the final native Mac app. The MVP goal is to validate the core loop:

```text
User gets stuck
  -> clicks menu bar icon or presses hotkey
  -> ClawSense captures current screen
  -> sends screenshot/context to Claude Code
  -> returns one next action
  -> user marks useful/wrong/retry
```

Electron is the best V0 choice because it gives us the fastest path across UI, hotkeys, tray behavior, screenshots, and Node-based Claude integration.

## Option Comparison

| Option | MVP Speed | Native Feel | Claude Code Integration | Screenshot / Hotkey Fit | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Electron | High | Medium | High | High | Best V0 choice |
| Tauri | Medium | Medium-High | Medium | Medium | Good V1 candidate |
| Swift / SwiftUI | Low-Medium | Highest | Medium | High | Best later native app candidate |
| Raycast Extension | Very High | High | Low-Medium | Medium | Good hacky validation path |
| screenpipe integration | Medium | Medium | Medium-High | High | Strong V1 context-memory layer |

## Why Electron for V0

Electron has the required primitives already available:

- `globalShortcut` for app-wide hotkeys.
- `desktopCapturer` for screen/window capture.
- `Tray` for menu bar presence and quick actions.
- `BrowserWindow` for always-on-top overlay/card UI.
- Node.js runtime for calling Claude Code CLI or Claude Agent SDK.

V0 should optimize for fast learning, not final architecture. Electron lets us build the whole loop in TypeScript and avoid early Swift/Rust native complexity.

References:

- Electron `desktopCapturer`: https://www.electronjs.org/docs/api/desktop-capturer/
- Electron `globalShortcut`: https://www.electronjs.org/docs/latest/api/global-shortcut
- Electron `Tray`: https://www.electronjs.org/docs/latest/tutorial/tray
- Electron `BrowserWindow`: https://www.electronjs.org/docs/api/browser-window

## Tauri Assessment

Tauri is attractive for a later version because it is lightweight and fits a local-first desktop product.

It has official support for:

- Global shortcuts
- System tray
- Rust-side native integrations

The main drawback for V0 is screenshot implementation speed. We would likely need to call macOS APIs through Rust, use an external crate, or shell out to `screencapture`. That is fine later, but it adds friction before the product loop is proven.

References:

- Tauri Global Shortcut: https://tauri.app/ja/plugin/global-shortcut/
- Tauri System Tray: https://v2.tauri.app/learn/system-tray/

## Swift / SwiftUI Assessment

Swift is the cleanest long-term Mac-native path.

Useful native APIs:

- `ScreenCaptureKit` for modern screen capture.
- `MenuBarExtra` for menu bar utilities.
- `NSWorkspace.frontmostApplication` for active app detection.
- `AXUIElement` / Accessibility APIs for UI context.

The drawback is integration speed. Claude Agent SDK and Claude Code CLI are easier to drive from Node.js. Swift would likely need a Node/CLI bridge anyway.

Swift becomes more attractive when:

- The core loop is validated.
- We need better permission UX.
- We need deeper macOS context capture.
- We want a polished native product.

References:

- Apple ScreenCaptureKit: https://developer.apple.com/documentation/ScreenCaptureKit/
- Apple MenuBarExtra: https://developer.apple.com/documentation/swiftui/menubarextra
- NSWorkspace frontmostApplication: https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication
- AXUIElement: https://developer.apple.com/documentation/applicationservices/axuielement

## Raycast Assessment

Raycast could be useful for extremely fast validation, especially if the first prototype can be a command rather than a persistent app.

Pros:

- Very fast to build.
- Native-feeling command surface.
- Built-in extension patterns.
- Existing screen/OCR ecosystem in Raycast extensions.

Cons:

- Not ideal for persistent overlay behavior.
- Not ideal for background context collection.
- Claude Code session integration is less direct.
- ClawSense should eventually be its own product surface.

References:

- Raycast AI API: https://developers.raycast.com/api-reference/ai
- Raycast Browser Extension API: https://developers.raycast.com/api-reference/browser-extension
- Raycast Script Commands: https://manual.raycast.com/script-commands

## screenpipe Assessment

screenpipe is highly relevant for V1.

It already covers much of the eventual context-memory layer:

- Screen capture
- OCR
- Accessibility tree extraction
- App switching
- Browser URLs
- Audio transcription
- Local storage
- Local API
- MCP integration with Claude/Cursor-like tools

This suggests ClawSense should not compete mainly on "recording everything." The stronger product wedge is:

> Trigger the right agent at the right stuck moment with the right context.

Possible strategy:

```text
V0: Electron manual trigger + screenshot + Claude Code
V1: Add local work context, possibly via screenpipe or a similar API
V2: Route into OpenClaw sessions
V3: Add behavioral and optional camera-based trigger hints
```

References:

- screenpipe GitHub: https://github.com/screenpipe/screenpipe
- screenpipe docs: https://docs.screenpi.pe/

## Claude Code Integration

There are two likely paths.

### Path A: Claude Code CLI Bridge

Use the installed `claude` command first.

Pros:

- Fastest to test.
- Works with existing Claude Code auth/session setup.
- Supports non-interactive mode with `-p/--print`.
- Supports continuing/resuming sessions.

Cons:

- Image attachment support through CLI needs direct validation.
- Output parsing may be less structured unless using JSON output.
- Long-running process/session management may get awkward.

### Path B: Claude Agent SDK

Use `@anthropic-ai/claude-agent-sdk`.

Pros:

- Better programmatic control.
- Streaming messages.
- Session IDs.
- Structured output support.
- MCP configuration.
- Built for agent applications.

Cons:

- Slightly more setup than shelling out to CLI.
- May require API key or careful auth handling.

Recommendation:

```text
Spike with CLI first.
Move to Claude Agent SDK once the V0 loop works.
```

References:

- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Claude Agent SDK TypeScript: https://platform.claude.com/docs/en/agent-sdk/typescript
- Claude Vision docs: https://platform.claude.com/docs/en/docs/build-with-claude/vision

## Screenshot Strategy

V0 options:

1. Electron `desktopCapturer`
2. macOS `screencapture` command fallback
3. Later: native ScreenCaptureKit

Recommendation:

```text
Use Electron desktopCapturer as the main path.
Keep screencapture fallback for local prototypes.
Move to ScreenCaptureKit only if we need better performance/permissions/window selection.
```

Important constraint:

- macOS requires Screen Recording permission for screen capture.

## MVP Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | App runs as a desktop/menu bar app. | P0 |
| FR2 | User can trigger ClawSense from the menu bar icon. | P0 |
| FR3 | User can trigger ClawSense with a global shortcut. | P0 |
| FR4 | App captures the current screen. | P0 |
| FR5 | App can show a preview or disclosure of captured context before sending. | P1 |
| FR6 | User can add an optional short note. | P0 |
| FR7 | App sends screenshot and prompt to Claude Code. | P0 |
| FR8 | App receives the Claude response. | P0 |
| FR9 | App displays exactly one suggested next action in an overlay/card. | P0 |
| FR10 | User can mark the suggestion as useful, wrong, or retry. | P0 |
| FR11 | App logs trigger, response, latency, and feedback locally. | P0 |
| FR12 | App supports adapter boundaries for Claude Code now and OpenClaw later. | P1 |
| FR13 | App can show a subtle bottom-right trigger button. | P1 |

## Menu Bar Requirements

V0 should treat the menu bar icon as the primary visible product surface.

Menu bar behavior:

- The app starts into the menu bar.
- The icon remains available while the app is running.
- Left click opens a small action menu.
- The user can trigger `Ask ClawSense` from the menu.
- The user can trigger `Add note and ask` from the menu.
- The user can open the latest suggestion card from the menu.
- The user can open settings from the menu.
- The user can quit from the menu.

Menu items:

```text
Ask ClawSense
Add Note and Ask
Open Last Suggestion
Settings
Quit
```

Acceptance criteria:

- The app can be used without opening a normal main window.
- The menu bar trigger and hotkey call the same capture flow.
- The menu bar stays available after the suggestion card is dismissed.
- The app does not capture the screen just by being open.

## MVP Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Privacy | Capture only after explicit user action in V0. |
| Privacy | Make it clear when screen capture is happening. |
| Privacy | Store logs locally by default. |
| Trust | Do not execute actions automatically. |
| UX | Show only one next action. |
| UX | Keep overlay small and dismissible. |
| Reliability | Failed Claude calls should show retry state. |
| Extensibility | Agent integration should be behind an adapter interface. |
| Platform | V0 targets macOS first. |

## Proposed V0 Architecture

```text
Electron main process
  -> TrayController
  -> ShortcutController
  -> CaptureService
       -> desktopCapturer
       -> screencapture fallback
  -> AgentAdapter
       -> ClaudeCliAdapter
       -> ClaudeSdkAdapter later
       -> OpenClawAdapter later
  -> FeedbackLogger

Electron renderer
  -> Capture note modal
  -> Suggestion card overlay
  -> Feedback buttons
```

## Suggested Data Model

```ts
type TriggerEvent = {
  id: string;
  createdAt: string;
  source: "hotkey" | "tray" | "button";
  activeApp?: string;
  windowTitle?: string;
  screenshotPath: string;
  userNote?: string;
};

type AgentResponse = {
  triggerId: string;
  provider: "claude-cli" | "claude-sdk" | "openclaw";
  sessionId?: string;
  latencyMs: number;
  likelyIntent: string;
  nextAction: string;
  why: string;
  confidence?: "low" | "medium" | "high";
  rawText: string;
};

type FeedbackEvent = {
  triggerId: string;
  createdAt: string;
  feedback: "useful" | "wrong" | "retry" | "dismissed";
};
```

## Open Risks

| Risk | Why It Matters | Mitigation |
| --- | --- | --- |
| Claude CLI image path is not clean enough | Could block fastest bridge | Validate in first spike; use API/SDK if needed |
| Screenshot-only context is too weak | Core suggestion may be shallow | Add optional note in V0, recent context in V1 |
| Permission UX is awkward | Screen Recording permission can scare users | Make capture explicit; explain locally |
| Overlay becomes annoying | Product may feel interruptive | Manual trigger only in V0 |
| Electron feels heavy | Could hurt trust/performance later | Accept for V0; revisit Tauri/Swift after validation |

## Next Step

Build a small Electron spike:

```text
1. Create Electron app.
2. Add tray icon.
3. Register global shortcut.
4. Capture screenshot.
5. Send prompt to Claude Code.
6. Render one suggestion card.
7. Log useful/wrong/retry feedback.
```

Success condition:

```text
Within one working session, we can trigger ClawSense from a hotkey,
capture the current screen, send it to Claude Code, and see one useful next action.
```
