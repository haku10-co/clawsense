# ClawSense

ClawSense is a context-aware trigger layer for OpenClaw.

It observes the user's current work context, detects or receives a moment of confusion, and connects that context to an agent session such as Claude Code, Codex, or OpenClaw. The first version should stay simple: the user presses a button, ClawSense captures the current screen, sends it to Claude Code, and returns one suggested next action.

## Core Idea

When users get stuck, the hardest part is often not asking for help. It is explaining the current context:

- What they are looking at
- What they were trying to do
- What they already tried
- What failed
- What they are likely to want next

ClawSense reduces that explanation cost by capturing the surrounding context and handing it to an agent.

## Product Positioning

ClawSense should not be positioned as a generic AI butler at first.

The stronger framing is:

> A context-aware intent and trigger layer for OpenClaw.

OpenClaw handles session execution, research, and agent work. ClawSense handles the moment before that: understanding when help is needed and packaging the right context.

## Initial Hypothesis

We believe that if a user can press one button while stuck, and ClawSense sends the current screen to Claude Code, then Claude Code can return one useful next action that helps the user continue without manually explaining the full situation.

Success signal:

- In at least 30% of triggered sessions, the user says the proposed action helped them move forward.

## Target User

Initial target:

- Developers and power users already using Claude Code, Codex, or OpenClaw
- Users who frequently get stuck inside codebases, terminals, browsers, docs, or local tools
- Users who understand agent workflows but dislike repeatedly writing context prompts

Later targets:

- Non-technical operators using complex SaaS tools
- Customer support and operations teams
- Anyone working across many browser tabs and desktop apps

## Product Principles

- Suggest one next action, not a menu of options.
- Start with user-triggered help before automatic detection.
- Preserve user trust by making capture explicit.
- Keep sensitive context local where possible.
- Avoid automatic execution until suggestion quality is proven.
- Treat face and emotion signals as optional trigger hints, not as stored identity data.

## Roadmap

### V0: Manual Trigger MVP

Goal:

- Validate whether screenshot-only context can produce useful next actions.

Flow:

1. User clicks the menu bar icon or presses a hotkey.
2. ClawSense captures the current screen.
3. User can optionally add a short note.
4. ClawSense sends the screenshot and prompt to Claude Code.
5. Claude Code investigates and reasons.
6. ClawSense shows one suggestion card.
7. User marks the suggestion as useful, wrong, or asks again.

Scope:

- Menu bar icon
- Manual trigger
- Global hotkey
- Screenshot capture
- Claude Code integration
- One-card response UI
- Basic feedback logging

Out of scope:

- Automatic operation
- Background work logs
- Facial expression detection
- Multi-agent routing
- Full OpenClaw integration

### V1: Work Context Memory

Goal:

- Improve intent understanding by attaching recent local work context.

Context to capture:

- Active app
- Window title
- Browser URL
- Recent screenshots
- Current working directory
- Open file names
- Recent terminal errors
- Recent command failures
- Click and focus changes at a coarse level

Privacy boundaries:

- Do not capture raw keystroke contents by default.
- Do not capture clipboard contents by default.
- Mask secrets before sending context to remote models.
- Keep rolling logs local and short-lived.
- Let users inspect what will be sent.

### V2: Behavioral Auto-Trigger

Goal:

- Detect likely stuck moments without requiring the user to press a button.

Candidate signals:

- Same error appears repeatedly.
- Same screen remains active for a long time.
- User switches between search results and the same work screen repeatedly.
- Several commands fail in a row.
- User repeatedly undoes or backtracks.
- Input stops after an error or failed command.

Behavior:

- ClawSense should not interrupt aggressively.
- It should show a small, dismissible suggestion to help.
- The user should remain in control of whether context is sent.

### V3: Optional Human Signals

Goal:

- Use physical signals as one additional trigger signal.

Candidate signals:

- Eyes closed for several seconds
- Long inactive gaze
- Visible frustration-like expression
- Head down or disengaged posture

Constraints:

- Fully opt-in
- Local-only processing
- No face data storage
- No identity recognition
- No emotional claims in UI
- Used only as a trigger hint

## MVP Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | ClawSense runs as a menu bar app. | P0 |
| FR2 | User can trigger ClawSense from the menu bar icon. | P0 |
| FR3 | User can trigger ClawSense with a global hotkey. | P0 |
| FR4 | ClawSense can capture the current screen. | P0 |
| FR5 | User can optionally add a short text note before sending. | P0 |
| FR6 | ClawSense can send the screenshot and prompt to a Claude Code session. | P0 |
| FR7 | ClawSense can receive the Claude Code response. | P0 |
| FR8 | ClawSense displays exactly one suggested next action. | P0 |
| FR9 | User can mark the suggestion as useful, wrong, or regenerate. | P0 |
| FR10 | ClawSense logs trigger events and feedback locally. | P0 |
| FR11 | ClawSense can show a subtle bottom-right trigger button. | P1 |
| FR12 | ClawSense can attach recent work context. | P1 |
| FR13 | ClawSense can detect likely stuck moments from behavior. | P2 |
| FR14 | ClawSense can use optional camera-based trigger hints. | P3 |

## Menu Bar Behavior

The V0 entry point is the macOS menu bar icon.

Menu actions:

- Ask ClawSense
- Add note and ask
- Open recent suggestion
- Settings
- Quit

Default interaction:

- Left click opens the quick action menu.
- `Ask ClawSense` captures the current screen and sends it to Claude Code.
- `Add note and ask` opens a small note input before capture/send.
- The answer appears as a bottom-right suggestion card.
- The app stays out of the Dock by default if packaging allows it.

## Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Privacy | User-triggered capture must be explicit in V0. |
| Privacy | Sensitive text should be masked before remote submission where possible. |
| Latency | First response should appear within a tolerable agent response window. |
| Trust | User should know what context is being sent. |
| Control | No automatic execution in the MVP. |
| Reliability | Failed agent calls should return a clear retry state. |
| Extensibility | Claude Code should be implemented as an adapter so Codex and OpenClaw can be added later. |

## Suggested Architecture

```text
Mac menu bar app / local desktop app
  -> Trigger controller
  -> Screenshot capture
  -> Context collector
  -> Privacy filter
  -> Agent adapter
       -> Claude Code adapter
       -> Codex adapter
       -> OpenClaw adapter
  -> Suggestion card overlay
  -> Feedback logger
```

## V0 Technical Decision

The V0 implementation uses Electron and Claude Code CLI.

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

Detailed spec: [docs/mvp-spec.md](docs/mvp-spec.md)

## Agent Prompt Shape

```text
You are helping a user who is currently stuck.

You will receive:
- A screenshot of their current screen
- Optional user note
- Optional recent work context

Your job:
- Infer what the user is likely trying to do
- Identify the next useful action
- Return only one recommended action
- Keep the answer concise
- Do not suggest multiple paths unless absolutely necessary

Output format:
1. Likely intent
2. Next action
3. Why this action
4. Confidence
```

## Suggestion Card Shape

```text
Likely intent:
[What the user seems to be trying to do]

Next action:
[One concrete next step]

Why:
[Short reason]

Actions:
- Do it
- Wrong
- Ask again
```

## Metrics

Primary:

- Useful suggestion rate
- Regeneration rate
- Wrong suggestion rate
- Time from trigger to useful answer

Secondary:

- Trigger frequency
- Repeat usage
- Accepted suggestions per user per week
- Sessions where user continues working after suggestion
- Manual trigger to auto-trigger conversion rate

## Main Risks

### Context Risk

The screenshot alone may not contain enough information to infer intent.

Mitigation:

- Add optional user note in V0.
- Add recent work context in V1.

### Trust Risk

Users may feel uncomfortable with screen or camera capture.

Mitigation:

- Start with explicit manual trigger.
- Show what will be sent.
- Keep logs local by default.
- Make camera signals opt-in only.

### Interruption Risk

Auto-triggering may feel annoying or wrong.

Mitigation:

- Delay auto-trigger until V2.
- Use quiet, dismissible prompts.
- Tune trigger thresholds from user feedback.

### Value Risk

The agent may produce obvious or generic advice.

Mitigation:

- Focus on developers and power users first.
- Include codebase, terminal, and URL context.
- Measure whether suggestions actually help users continue.

## Open Questions

- Should V0 be a Mac menu bar app, Electron app, or Tauri app?
- What is the cleanest way to create or attach to a Claude Code session?
- Should the first response be generated by Claude Code directly or by a smaller local router first?
- What context should be visible to the user before sending?
- How much of the recent work log should be retained?
- Should OpenClaw become the default agent runtime after Claude Code validation?

## 30-Day Plan

Week 1:

- Build manual trigger.
- Capture screenshot.
- Send screenshot to Claude Code.
- Render one suggestion card.

Week 2:

- Add feedback buttons.
- Log useful, wrong, and regenerate events.
- Test with internal developer workflows.

Week 3:

- Add optional short user note.
- Improve prompt format.
- Measure suggestion usefulness.

Week 4:

- Decide whether to continue with screenshot-only V0 or move to V1 context logs.
- Define first work-context collector.
- Prepare OpenClaw adapter design.
