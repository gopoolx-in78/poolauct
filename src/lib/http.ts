/**
 * Reads a request body into memory, stopping as soon as it exceeds `max` bytes (a chunked body has no Content-Length,
 * so the header alone cannot be trusted). Returns null when the body is too large.
 */
export async function readBodyCapped(request: Request, max: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Same-origin check for cookie-authenticated POST route handlers (Server Actions get this from Next.js; route handlers
 * do not). Requires an Origin header whose host matches the request's host, and rejects cross-site fetch metadata.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
