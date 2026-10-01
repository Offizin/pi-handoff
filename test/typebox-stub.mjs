/** Minimal stand-in for the typebox builders the extension imports. */
export const Type = {
	Object: (properties) => ({ type: "object", properties }),
	Optional: (schema) => schema,
	String: (options) => ({ type: "string", ...options }),
};
