const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Masks personal and secret values in free text before it reaches logs (Phase 10, TD-72): e-mail addresses, JWTs and
 * long tokens, phone / card / account-like digit runs. Keeps the message useful for debugging (codes, words, short ids).
 */
export function redact(text: string, maxLength = 500): string {
  const out = text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\b(?:Bearer|bearer)\s+\S+/g, "Bearer [token]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, (m) =>
      UUID.test(m) ? m : "[token]",
    )
    .replace(/(?<![\w-])\+?\d[\d -]{8,}\d(?![\w-])/g, "[number]");
  return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

/** Path without its query string or fragment (query strings can carry tokens and e-mail addresses). */
export function pathOnly(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? "/";
}
