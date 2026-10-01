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
  `/handoff <prompt>` is dispatched immediately, and the command handler waits
  for the turn to settle before replacing the session.

Mechanics: `ctx.waitForIdle()` → `ctx.newSession({parentSession, withSession})`
→ `sendUserMessage(kickoff)` in the replacement session. Old session file stays
on disk, linked via parent header. Handoffs are single-flight: a second tool
call or `/handoff` while one is queued/running is refused, because pi's
`newSession()` is not reentrant.

## pi API gotchas baked into this extension (do not "simplify" them away)

1. `pi.sendUserMessage()` needs `expandPromptTemplates: true` — without it,
   `/handoff ...` is delivered as literal chat text instead of dispatching
   the command (the model will improvise instead of a new session opening).
2. Tool signature is `execute(toolCallId, params, signal, onUpdate, ctx)` —
   params are the **second** argument.
3. Don't load this extension twice (e.g. `-e` flag *and* global symlink):
   `handoff` would register twice.
4. Handoffs are single-flight (module-level `handoffState`). pi's
   `AgentSessionRuntime.newSession()` is not reentrant — two concurrent
   replacements both run `withSession` against the same session, and the second
   `sendUserMessage` throws "Agent is already processing", which the
   interactive host turns into a fatal exit.

## Development

```sh
npm test    # single-flight regression tests (node --test; typebox is stubbed, no install)
```
