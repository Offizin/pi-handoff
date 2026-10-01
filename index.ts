/**
 * pi-handoff — bare session-handover mechanics for pi.
 *
 * One command + one tool. No workflow policy: the handover prompt is
 * whatever the caller passes (typically "@HANDOVER.md" or a file the
 * agent wrote before handing over).
 *
 * Usage:
 *   /handoff @HANDOVER.md          (user-invoked; args become kickoff prompt)
 *   Agent calls the `handoff` tool → /handoff <prompt> is dispatched, and its
 *   command handler waits for the current turn to settle before replacing the
 *   session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Single-flight guard. `AgentSessionRuntime.newSession()` is not reentrant:
 * two concurrent replacements share the runtime's session pointer, and the
 * second `withSession().sendUserMessage()` throws "Agent is already
 * processing", which the interactive host escalates to a fatal exit.
 * `queued` = the tool handed `/handoff …` to pi but its command handler has
 * not started yet; `running` = a command handler owns the replacement.
 */
let handoffState: "idle" | "queued" | "running" = "idle";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("handoff", {
		description:
			"Continue work in a fresh session. Args = kickoff prompt for the new session (default: @HANDOVER.md).",
		handler: async (args, ctx) => {
			if (handoffState === "running") {
				ctx.ui.notify("Handoff already in progress; ignoring duplicate request", "warn");
				return;
			}
			handoffState = "running";
			try {
				const kickoff = args.trim() || "@HANDOVER.md";

				await ctx.waitForIdle();

				const parent = ctx.sessionManager.getSessionFile();
				ctx.ui.notify(`Handing off → fresh session, kickoff: ${kickoff}`, "info");

				const result = await ctx.newSession({
					parentSession: parent,
					withSession: async (replacementCtx) => {
						// Only use replacementCtx here — captured old ctx/pi are stale.
						await replacementCtx.sendUserMessage(kickoff);
					},
				});

				if (result.cancelled) {
					ctx.ui.notify("Handoff cancelled (new session was rejected)", "warn");
				}
			} finally {
				handoffState = "idle";
			}
		},
	});

	pi.registerTool({
		name: "handoff",
		label: "Handoff to fresh session",
		description:
			"End this session and continue work in a brand-new session. " +
			"BEFORE calling this tool: finish/commit your work, write durable state " +
			"(e.g. HANDOVER.md with entry points, phase scope, verification commands, " +
			"open risks), then pass the file reference as the prompt (default @HANDOVER.md). " +
			"The handoff happens after your current turn ends.",
		parameters: Type.Object({
			prompt: Type.Optional(
				Type.String({
					description:
						"Kickoff prompt for the new session. Usually a file reference like '@HANDOVER.md'. Default: '@HANDOVER.md'.",
				}),
			),
		}),
		async execute(_toolCallId, args) {
			if (handoffState !== "idle") {
				return {
					content: [
						{
							type: "text",
							text: "Handoff already in progress; no new handoff queued.",
						},
					],
				};
			}
			const prompt = (args as { prompt?: string })?.prompt?.trim() || "@HANDOVER.md";
			// Tools cannot call ctx.newSession() directly; hand `/handoff …` to pi.
			// expandPromptTemplates is REQUIRED: without it "/handoff ..." is
			// delivered as literal text instead of dispatching the command.
			// Extension commands run immediately (even while streaming), so the
			// handler is usually already waiting on waitForIdle when this returns —
			// claim the slot first so a second tool call cannot double-send.
			handoffState = "queued";
			pi.sendUserMessage(`/handoff ${prompt}`, {
				deliverAs: "followUp",
				expandPromptTemplates: true,
			});
			return {
				content: [
					{
						type: "text",
						text: `Handoff queued: fresh session will start with "${prompt}" once this turn completes.`,
					},
				],
			};
		},
	});
}
