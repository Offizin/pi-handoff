/**
 * pi-handoff — bare session-handover mechanics for pi.
 *
 * One command + one tool. No workflow policy: the handover prompt is
 * whatever the caller passes (typically "@HANDOVER.md" or a file the
 * agent wrote before handing over).
 *
 * Usage:
 *   /handoff @HANDOVER.md          (user-invoked; args become kickoff prompt)
 *   Agent calls the `handoff` tool → /handoff <prompt> is queued as a
 *   follow-up and runs when the current turn settles.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("handoff", {
		description:
			"Continue work in a fresh session. Args = kickoff prompt for the new session (default: @HANDOVER.md).",
		handler: async (args, ctx) => {
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
			const prompt = (args as { prompt?: string })?.prompt?.trim() || "@HANDOVER.md";
			// Tools cannot call ctx.newSession() directly; queue the command as a
			// follow-up — it fires when the current turn has no more tool calls.
			// expandPromptTemplates is REQUIRED: without it "/handoff ..." is
			// delivered as literal text instead of dispatching the command.
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
