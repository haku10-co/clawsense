# ClawBrow

[![Build in public](https://img.shields.io/badge/build-in%20public-FF6B6B)](https://github.com/haku10-co/clawbrow)
[![Status: alpha](https://img.shields.io/badge/status-alpha-yellow)](https://github.com/haku10-co/clawbrow)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/haku10-co/clawbrow)

> 眉が動いたら、AIが動く。

ClawBrow is a macOS menu bar agent that watches for stuck-work signals, reads your current screen, and asks Claude Code to propose the next thing to do. When your brow tightens, your eyes narrow, or you keep staring at the same app, ClawBrow can quietly surface three concrete next actions. Pick one, and Claude Code executes it through your connected MCP integrations.

> Built in public. Code first, polish later. PRs and ideas welcome.

---

## Why

Asking AI for help has the same friction as asking a human: explaining the situation. The moment you need help is often the moment you least want to stop and write context.

ClawBrow removes that friction by using the signals already in front of it:

- your current screen
- visible text from local OCR
- the active app
- connected MCP tools
- and, when enabled, brow and expression movement that suggests you might be stuck

The goal is not to judge your mood. The goal is to catch the small "I am blocked" moment and turn it into a useful next action.

## What It Does

- **Brow trigger** — detects stuck-work signals from brow movement, squinting, frown signals, and sustained focus
- **Screenshot trigger** — `⌘⇧Space` or click the menu bar `CB` icon
- **Three directions** — Claude Code returns three short, action-oriented choices
- **Pick one -> execute** — Claude Code uses your live MCP integrations to actually do the thing
- **Continue in chat** — keep iterating in the popover, or hand off to a terminal Claude Code session via `claude --resume <id>`
- **Context sensors** — knows your active app and which MCPs are connected
- **Local OCR** — extracts visible text from screenshots with Apple Vision before prompting Claude Code
- **Editable prompts** — `picker.md` and `direction.md` are user-editable Markdown files
- **Privacy-first camera path** — camera frames stay on your Mac; the watcher reports scores, not video

## Status

Pre-alpha. The codebase is the truth, the README is aspirational. Expect rough edges. Design decisions are documented in commit messages, not in long docs.

## Quick Start

### Prerequisites

- macOS 13+
- Node 20+
- [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code) installed and signed in (`claude` on your PATH)
- Optional: MCP integrations configured — `claude mcp list` should show at least one `✓ Connected`

### Run From Source

```bash
git clone https://github.com/haku10-co/clawbrow.git
cd clawbrow
npm install
npm start
```

The first launch may ask for macOS permissions:

- **Screen Recording** — to capture screenshots
- **Automation -> System Events** — to read which app is frontmost
- **Camera** — to detect brow and stuck-work signals locally

If a screenshot returns just your wallpaper, Screen Recording was denied; toggle it in System Settings and restart the app.

### Build A Packaged `.app`

```bash
# Unpacked .app for local testing (faster)
npm run pack

# DMG + zip for distribution
npm run dist
```

Output lands in `release/`.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│ Tray (CB) — hotkey ⌘⇧Space                                │
│   ↓                                                      │
│ src/main/main.ts                                         │
│   captureScreen → gatherContext + OCR → askClaude        │
│                       │                ↓                 │
│                       │            Picker (3 actions)    │
│   ┌───────────────────┴─────────┐                        │
│   ↓                             ↓                        │
│ sensors/                    mcp.ts                       │
│   face-watcher.ts            claude mcp list →           │
│   active-app.ts              connected/needs-auth/failed │
│                                                          │
│ Brow/stuck sample → looks-stuck-detector                 │
│   ↓                                                      │
│ Passive trigger → runAsk("looks-stuck")                  │
│                                                          │
│ User picks → session.startSession                        │
│   ↓                                                      │
│ askDirection (claude -p --session-id <uuid>)             │
│   executes via MCP, reports back in the popover          │
│   ↓                                                      │
│ "Open in terminal" → osascript / open -na to             │
│ user's preferred terminal with claude --resume <uuid>    │
└──────────────────────────────────────────────────────────┘
```

Key files:

| File | Role |
|---|---|
| `src/main/main.ts` | Tray, hotkey, passive stuck trigger, run pipeline |
| `src/main/sensors/face-watcher.ts` | Hidden camera watcher window and face-sample reporting |
| `src/main/sensors/looks-stuck-detector.ts` | Sustained stuck-signal detector |
| `src/renderer/face-watcher.html` | MediaPipe FaceLandmarker, brow geometry, expression scoring |
| `src/main/claude.ts` | Spawn `claude` CLI, abort/timeout/resume |
| `src/main/claude-binary.ts` | Find the `claude` binary across common install paths |
| `src/main/session.ts` | Conversation state + Claude session lifecycle |
| `src/main/mcp.ts` | `claude mcp list` parser, 30s cache |
| `src/main/ocr.ts` | Run local Apple Vision OCR helper and return prompt-safe text |
| `native/ocr-helper/main.swift` | Swift OCR helper built into `native/bin/ClawBrowOCR` |
| `src/main/sensors/active-app.ts` | Frontmost app via osascript |
| `src/main/context.ts` | Compose the noteBlock from sensors + MCP + user note |
| `src/main/terminal/` | Per-app terminal launchers for "Open in terminal" |
| `src/renderer/` | Vanilla TS + HTML/CSS, no framework |

## Privacy & Permissions

- Screenshots are saved at `~/Library/Application Support/ClawBrow/screenshots/` and passed to the local `claude -p` CLI. Anthropic receives them as part of the request your local Claude Code makes.
- OCR runs locally through Apple Vision. Extracted text is added to the Claude prompt for the current request, but raw OCR text is not written to `events.jsonl`.
- Camera frames are processed locally in a hidden renderer using MediaPipe FaceLandmarker. ClawBrow forwards expression scores and brow geometry, not video frames.
- Window titles, app names, MCP server names, and debug events live in process and may end up in `~/Library/Application Support/ClawBrow/events.jsonl` for debugging — purely local.
- No telemetry to ClawBrow itself. There is no ClawBrow server.
- `--dangerously-skip-permissions` is passed to the Claude CLI. This is the deliberate trade-off for low-friction execution; understand it before enabling power features.

## Building In Public

This repo is a daily working tree. Read the commit log to see why a decision was made — the messages are written for that. If something looks weird, it probably is, and there is usually a commit explaining why.

Follow / heckle / suggest:

- GitHub: [@haku10-co](https://github.com/haku10-co)
- Issues for bugs, Discussions for ideas

## Roadmap

- [x] 3-action picker over Claude Code CLI
- [x] MCP awareness in prompt
- [x] Active-app sensor
- [x] Editable prompts on disk
- [x] History + reopen
- [x] Persisted window bounds
- [x] Hidden-while-thinking UX
- [x] Local OCR via Apple Vision
- [x] Brow/expression watcher via MediaPipe
- [x] Sustained stuck-signal detector
- [ ] First-run calibration UI for brow baseline
- [ ] Camera source picker
- [ ] Passive auto-suggest controls
- [ ] Crop to frontmost window for tighter screenshots
- [ ] Transition tracker with a short app-focus ring buffer
- [ ] Settings UI

## Contributing

This is early; please do not open large PRs without an issue first. Small fixes, typo PRs, prompt suggestions — go for it.

If you want to chat about a feature, open a Discussion.

## License

MIT — see [LICENSE](LICENSE).
