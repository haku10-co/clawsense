# ClawSense

[![Build in public](https://img.shields.io/badge/build-in%20public-FF6B6B)](https://github.com/haku10-co/clawsense)
[![Status: alpha](https://img.shields.io/badge/status-alpha-yellow)](https://github.com/haku10-co/clawsense)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/haku10-co/clawsense)

> A macOS menu bar layer that captures your screen, sends it to Claude Code, and proposes the next thing to do — and does it for you.

ClawSense lives in your menu bar. Hit `⌘⇧Space`, and it captures the current screen, asks Claude Code through the local CLI, and returns three concrete next actions. Pick one and Claude Code goes off and actually executes it through your connected MCP integrations (Calendar, Gmail, Notion, Linear, etc.). Or hand the conversation off to a real terminal session with `--resume`.

> Built in public. Code first, polish later. PRs and ideas welcome.

---

## Why

Asking AI for help has the same friction as asking a human: explaining the situation. ClawSense removes that friction by sending the screen as the situation, and asking Claude Code to figure out the next move.

It is most useful when you:

- have Claude Code running and a few MCPs wired up
- juggle a lot of tabs and windows
- get stuck on the meta-question of "what should I do next?"
- prefer "just do it" over "tell me what to do"

## What it does

- **Screenshot trigger** — `⌘⇧Space` or click the menu bar `CS` icon
- **Three directions** — Claude Code returns three short, action-oriented choices
- **Pick one → execute** — Claude Code uses your live MCP integrations to actually do the thing (add a calendar event, draft an email, edit a file, file a ticket)
- **Continue in chat** — keep iterating in the popover, or hand off to your terminal Claude Code session via `claude --resume <id>`
- **Sensors** — knows your active app and which MCPs are connected, feeds that as context
- **Editable prompts** — `picker.md` and `direction.md` are user-editable Markdown files
- **Privacy** — screenshots stay on your Mac except for the call to Claude Code, which runs locally as a CLI

## Status

Pre-alpha. The codebase is the truth, the README is aspirational. Expect rough edges. Design decisions are documented in commit messages, not in long docs.

## Quick start

### Prerequisites

- macOS 13+
- Node 20+
- [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code) installed and signed in (`claude` on your PATH)
- (Optional) MCP integrations configured — `claude mcp list` should show at least one `✓ Connected`

### Run from source

```bash
git clone https://github.com/haku10-co/clawsense.git
cd clawsense
npm install
npm start
```

The first launch asks for two macOS permissions:

- **Screen Recording** — to capture screenshots
- **Automation → System Events** — to read which app is frontmost

Both are required. If a screenshot returns just your wallpaper, Screen Recording was denied; toggle it in System Settings and restart the app.

### Build a packaged `.app`

```bash
# Unpacked .app for local testing (faster)
npm run pack

# DMG + zip for distribution
npm run dist
```

Output lands in `release/`.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Tray (CS) — hotkey ⌘⇧Space                                │
│   ↓                                                      │
│ src/main/main.ts                                         │
│   captureScreen → gatherContext → askClaude              │
│                       │                ↓                 │
│                       │            Picker (3 actions)    │
│                       │                                  │
│   ┌───────────────────┴─────────┐                        │
│   ↓                             ↓                        │
│ sensors/                    mcp.ts                       │
│   active-app.ts              claude mcp list →           │
│   (osascript)                connected/needs-auth/failed │
│                                                          │
│ User picks → session.startSession                        │
│   ↓                                                      │
│ askDirection (claude -p --session-id <uuid>)             │
│   executes via MCP, reports back in the popover          │
│   ↓                                                      │
│ "Open in terminal" → osascript / open -na to             │
│   user's preferred terminal with claude --resume <uuid>  │
└──────────────────────────────────────────────────────────┘
```

Key files:

| File | Role |
|---|---|
| `src/main/main.ts` | Tray, hotkey, run pipeline |
| `src/main/claude.ts` | spawn `claude` CLI, abort/timeout/resume |
| `src/main/claude-binary.ts` | Find the `claude` binary across common install paths |
| `src/main/session.ts` | Conversation state + Claude session lifecycle |
| `src/main/mcp.ts` | `claude mcp list` parser, 30s cache |
| `src/main/sensors/active-app.ts` | Frontmost app via osascript |
| `src/main/context.ts` | Compose the noteBlock from sensors + MCP + user note |
| `src/main/terminal/` | Per-app terminal launchers for "Open in terminal" |
| `src/renderer/` | Vanilla TS + HTML/CSS, no framework |

## Privacy & permissions

- Screenshots are saved at `~/Library/Application Support/ClawSense/screenshots/` and passed to the local `claude -p` CLI. Anthropic receives them as part of the request your local Claude Code makes.
- Window titles, app names, MCP server names live in process and may end up in `~/Library/Application Support/ClawSense/events.jsonl` for debugging — purely local.
- No telemetry to ClawSense itself. There is no ClawSense server.
- `--dangerously-skip-permissions` is passed to the Claude CLI. This is the deliberate trade-off for low-friction execution; understand it before enabling power features.

## Building in public

This repo is a daily working tree. Read the commit log to see why a decision was made — the messages are written for that. If something looks weird, it probably is, and there's a commit explaining why.

Follow / heckle / suggest:

- GitHub: [@haku10-co](https://github.com/haku10-co)
- Issues for bugs, Discussions for ideas

## Roadmap (rough)

- [x] 3-action picker over Claude Code CLI
- [x] MCP awareness in prompt
- [x] Active-app sensor (S1)
- [x] Editable prompts on disk
- [x] History + reopen
- [x] Persisted window bounds
- [x] Hidden-while-thinking UX
- [ ] Crop to frontmost window for tighter screenshots
- [ ] Transition tracker (15min ring buffer of app focus)
- [ ] Optional passive auto-suggest when stuck
- [ ] OCR pipeline via Gemini (parking lot)
- [ ] Settings UI (currently env / file edit only)

## Contributing

This is early; please do not open large PRs without an issue first. Small fixes, typo PRs, prompt suggestions — go for it.

If you want to chat about a feature, open a Discussion.

## License

MIT — see [LICENSE](LICENSE).
