import "server-only";

export function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Turns a `CODE: message` SQL error into the message shown to staff. */
export function sqlMessage(message: string | undefined) {
  if (!message) return "That action could not be completed.";
  if (message.startsWith("FORBIDDEN") || message.includes("permission")) return "You don’t have permission to do that.";
  const i = message.indexOf(":");
  return i > 0 && /^[A-Z_]+$/.test(message.slice(0, i))
    ? message.slice(i + 1).trim()
    : "That action could not be completed.";
}

/** Builds `path?notice=…` or `path?error=…` for redirect-after-action. */
export function outcome(path: string, error: { message?: string } | null | undefined, notice: string) {
  const sep = path.includes("?") ? "&" : "?";
  return error
    ? `${path}${sep}error=${encodeURIComponent(sqlMessage(error.message))}`
    : `${path}${sep}notice=${notice}`;
}
