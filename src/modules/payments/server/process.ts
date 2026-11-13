import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { WebhookVerificationError } from "../types";
import { getProvider, ProviderUnavailableError } from "./registry";

export type WebhookOutcome = { ok: true; result: string } | { ok: false; status: 400 | 404 | 500; error: string };

/**
 * Verifies a provider webhook and applies it through the single idempotent SQL entry point.
 * Used by the HTTP route and (in-process) by the sandbox test checkout, so both take the same path.
 */
export async function handlePaymentWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  let provider;
  try {
    provider = getProvider(providerName);
  } catch (e) {
    if (e instanceof ProviderUnavailableError) return { ok: false, status: 404, error: "unknown provider" };
    throw e;
  }

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, headers);
  } catch (e) {
    if (e instanceof WebhookVerificationError) return { ok: false, status: 400, error: "invalid webhook" };
    throw e;
  }

  const { data, error } = await createSupabaseAdminClient()
    .schema("api")
    .rpc("payments_process_event", {
      p_provider: provider.name,
      p_event_id: event.eventId,
      p_type: event.type,
      p_order_id: event.orderId,
      p_payment_id: event.paymentId,
      // bigint → string; PostgREST casts to bigint without precision loss
      p_amount_paise: event.amountPaise === null ? null : (event.amountPaise.toString() as unknown as number),
      p_currency: event.currency,
      p_refund_id: event.refundId,
      p_payload: event.safePayload,
    });
  if (error) {
    console.error("payments_process_event failed", { code: error.code });
    // 500 makes the provider retry later; processing is idempotent.
    return { ok: false, status: 500, error: "processing failed" };
  }
  return { ok: true, result: String(data) };
}
