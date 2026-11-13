import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { paise } from "@/lib/money";
import { getProvider } from "@/modules/payments/server/registry";

type Claimed = {
  refund_id: string;
  amount_paise: number | string;
  provider: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  attempt_no: number;
};

/**
 * PoolX refund worker. Claims refunds (marked REFUND_INITIATED before any provider call), asks the provider that
 * took the payment to refund it with a stable idempotency key, and records the provider's answer. A refund is only
 * REFUNDED when the provider reports it processed.
 */
export async function processPoolxRefunds(limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.schema("api").rpc("poolx_claim_refunds", { p_limit: limit });
  if (error) throw new Error(`poolx_claim_refunds failed: ${error.code}`);

  const results: { refundId: string; result: string }[] = [];
  for (const row of (data ?? []) as Claimed[]) {
    let outcome: { status: string; providerRefundId?: string; error?: string; retryable?: boolean };
    try {
      if (!row.provider || !row.provider_payment_id) throw new Error("original payment has no provider reference");
      outcome = await getProvider(row.provider).refund({
        providerPaymentId: row.provider_payment_id,
        amountPaise: paise(String(row.amount_paise)),
        idempotencyKey: row.idempotency_key,
      });
    } catch (e) {
      outcome = { status: "FAILED", error: e instanceof Error ? e.message : "provider error", retryable: true };
    }
    const { data: result, error: recordError } = await admin.schema("api").rpc("poolx_record_refund_result", {
      p_refund: row.refund_id,
      p_status: outcome.status,
      p_provider_refund_id: outcome.providerRefundId ?? null,
      p_error: outcome.error ?? null,
      p_retryable: outcome.retryable ?? null,
    });
    if (recordError)
      console.error("poolx_record_refund_result failed", { refund: row.refund_id, code: recordError.code });
    results.push({ refundId: row.refund_id, result: recordError ? "RECORD_FAILED" : String(result) });
  }
  return results;
}

export async function closeDuePools(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().schema("api").rpc("poolx_close_due_pools");
  if (error) throw new Error(`poolx_close_due_pools failed: ${error.code}`);
  return Number(data ?? 0);
}
