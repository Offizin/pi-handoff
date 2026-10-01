/**
 * Registers the typebox -> stub alias so `index.ts` can be imported by tests
 * without installing typebox. The extension only uses Type.Object/String/Optional
 * to declare tool parameters; the guard under test never inspects them.
 */
import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "typebox") {
			return { url: new URL("./typebox-stub.mjs", import.meta.url).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
