/**
 * pi-handoff single-flight regression test.
 *
 * Reproduces the 2026-10-01 crash shape: two /handoff requests in flight at
 * once must produce ONE ctx.newSession() call, and a second handoff tool call
 * while one is queued/running must not send a second command.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const FILE = new URL("../index.ts", import.meta.url).href;
let seq = 0;

/** Fresh module instance per test (module state is the guard under test). */
async function load() {
	const mod = await import(`${FILE}?case=${++seq}`);
	const captured = { command: undefined, tool: undefined };
	const sends = [];
	const pi = {
		registerCommand(_name, def) {
			captured.command = def;
		},
		registerTool(def) {
			captured.tool = def;
		},
		sendUserMessage(content, options) {
			sends.push({ content, options });
		},
	};
	mod.default(pi);
	return { command: captured.command, tool: captured.tool, sends };
}

/** ctx with a controllable newSession; `defer` parks waitForIdle until released. */
function makeCtx({ cancelFirst = false, failFirst = false, defer = false } = {}) {
	let releaseGate;
	const gate = defer ? new Promise((resolve) => (releaseGate = resolve)) : Promise.resolve();
	const notify = [];
	const kickoffs = [];
	let calls = 0;
	const ctx = {
		ui: { notify: (message, level) => notify.push({ message, level }) },
		waitForIdle: () => gate,
		sessionManager: { getSessionFile: () => "/tmp/parent.jsonl" },
		newSession: async (options) => {
			calls += 1;
			if (calls === 1 && failFirst) throw new Error("Agent is already processing. Specify streamingBehavior");
			if (calls === 1 && cancelFirst) return { cancelled: true };
			await options.withSession({
				sendUserMessage: async (text) => kickoffs.push(text),
			});
			return { cancelled: false };
		},
	};
	return { ctx, notify, kickoffs, calls: () => calls, release: () => releaseGate?.() };
}

test("two concurrent /handoff handlers start exactly one replacement", async () => {
	const { command } = await load();
	const { ctx, notify, release, calls, kickoffs } = makeCtx({ defer: true });

	const first = command.handler("/one", ctx);
	const second = command.handler("/two", ctx); // must be refused synchronously
	release();
	await Promise.all([first, second]);

	assert.equal(calls(), 1, "newSession must run once");
	assert.deepEqual(kickoffs, ["/one"]);
	assert.ok(
		notify.some((n) => n.level === "warn" && n.message.includes("already in progress")),
		"duplicate request must warn",
	);
});

test("second handoff tool call while one is queued does not send", async () => {
	const { tool, sends } = await load();

	const a = await tool.execute("id-a", { prompt: "@HANDOVER.md" });
	const b = await tool.execute("id-b", { prompt: "@OTHER.md" });

	assert.equal(sends.length, 1, "only one /handoff command may be sent");
	assert.equal(sends[0].content, "/handoff @HANDOVER.md");
	assert.deepEqual(sends[0].options, { deliverAs: "followUp", expandPromptTemplates: true });
	assert.ok(a.content[0].text.includes("Handoff queued"));
	assert.ok(b.content[0].text.includes("already in progress"));
});

test("a cancelled replacement clears the guard for the next handoff", async () => {
	const { command } = await load();
	const first = makeCtx({ cancelFirst: true });
	await command.handler("/one", first.ctx);
	assert.equal(first.calls(), 1);

	const second = makeCtx();
	await command.handler("/two", second.ctx);
	assert.equal(second.calls(), 1, "guard must be released after cancellation");
	assert.deepEqual(second.kickoffs, ["/two"]);
});

test("a failed replacement clears the guard instead of wedging the session", async () => {
	const { command } = await load();
	const first = makeCtx({ failFirst: true });
	await assert.rejects(() => command.handler("/one", first.ctx), /already processing/);

	const second = makeCtx();
	await command.handler("/two", second.ctx);
	assert.equal(second.calls(), 1);
	assert.deepEqual(second.kickoffs, ["/two"]);
});

test("normal path forwards the kickoff into the replacement session", async () => {
	const { command } = await load();
	const { ctx, kickoffs, calls, notify } = makeCtx();
	await command.handler("  @HANDOVER.md extra  ", ctx);
	assert.equal(calls(), 1);
	assert.deepEqual(kickoffs, ["@HANDOVER.md extra"]);
	assert.ok(notify.some((n) => n.level === "info" && n.message.includes("Handing off")));
});
