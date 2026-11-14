import { connection } from "next/server";
import { handlePaymentWebhook } from "@/modules/payments/server/process";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Payment provider webhooks. Authenticity comes from the provider signature (not cookies), so there is no CSRF
 * surface. The raw body is read once and verified before any parsing.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/payments/[provider]">) {
  await connection();
  const { provider } = await ctx.params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "payload too large" }, { status: 413 });

  const rawBody = await readCapped(request, MAX_BODY_BYTES);
  if (rawBody === null) return Response.json({ error: "payload too large" }, { status: 413 });

  const outcome = await handlePaymentWebhook(provider, rawBody, request.headers);
  if (!outcome.ok)
    return Response.json(
      { error: outcome.error },
      { status: outcome.status, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json({ received: true, result: outcome.result }, { headers: { "Cache-Control": "no-store" } });
}

/** Reads the body as UTF-8, stopping as soon as it exceeds `max` bytes (a chunked body has no Content-Length). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
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
  return Buffer.concat(chunks).toString("utf8");
}
