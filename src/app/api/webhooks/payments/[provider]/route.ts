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

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return Response.json({ error: "payload too large" }, { status: 413 });

  const outcome = await handlePaymentWebhook(provider, rawBody, request.headers);
  if (!outcome.ok)
    return Response.json(
      { error: outcome.error },
      { status: outcome.status, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json({ received: true, result: outcome.result }, { headers: { "Cache-Control": "no-store" } });
}
