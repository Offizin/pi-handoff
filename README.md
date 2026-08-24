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

## pi API gotchas baked into this extension (do not "simplify" them away)

1. `pi.sendUserMessage()` needs `expandPromptTemplates: true` — without it,
   `/handoff ...` is delivered as literal chat text instead of dispatching
   the command (the model will improvise instead of a new session opening).
2. Tool signature is `execute(toolCallId, params, signal, onUpdate, ctx)` —
   params are the **second** argument.
3. Don't load this extension twice (e.g. `-e` flag *and* global symlink):
   `handoff` would register twice.
