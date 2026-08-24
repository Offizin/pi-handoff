# pi-handoff

Bare session-handover mechanics for [pi](https://github.com/earendil-works/pi-mono):
one command (`/handoff`) and one tool (`handoff`). No workflow policy — the
kickoff prompt is whatever the caller passes, typically `@HANDOVER.md`.

## Install (global)

```bash
ln -s /path/to/pi-handoff ~/.pi/agent/extensions/pi-handoff
```

## Usage

- User: `/handoff @HANDOVER.md` (or bare `/handoff`)
- Agent: write durable handover state first, then call the `handoff` tool;
  `/handoff <prompt>` is queued as a follow-up and runs when the turn settles.

Mechanics: `ctx.waitForIdle()` → `ctx.newSession({parentSession, withSession})`
→ `sendUserMessage(kickoff)` in the replacement session. Old session file stays
on disk, linked via parent header.
