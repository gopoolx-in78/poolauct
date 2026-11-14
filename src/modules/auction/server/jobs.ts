import "server-only";
import { paise } from "@/lib/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/modules/payments/server/registry";

type Claimed = {
  refund_id: string;
  amount_paise: number | string;
  provider: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  attempt_no: number;
};

/** Closes ended auctions (idempotent) and moves overdue winner invoices to review. */
export async function closeDueAuctions(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().schema("api").rpc("auction_close_due");
  if (error) throw new Error(`auction_close_due failed: ${error.code}`);
  return Number(data ?? 0);
}

/** Queues "auction starting soon" and "auction ending soon" notifications (idempotent per auction and user). */
export async function queueAuctionReminders(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().schema("api").rpc("auction_notify_due");
  if (error) throw new Error(`auction_notify_due failed: ${error.code}`);
  return Number(data ?? 0);
}

/**
 * Auction refund worker (§7.8): claim → provider refund with a stable idempotency key → record outcome.
 * A deposit is REFUNDED only when the provider confirms it.
 */
export async function processAuctionRefunds(limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.schema("api").rpc("auction_claim_refunds", { p_limit: limit });
  if (error) throw new Error(`auction_claim_refunds failed: ${error.code}`);
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
    const { data: result, error: recordError } = await admin.schema("api").rpc("auction_record_refund_result", {
      p_refund: row.refund_id,
      p_status: outcome.status,
      p_provider_refund_id: outcome.providerRefundId ?? null,
      p_error: outcome.error ?? null,
      p_retryable: outcome.retryable ?? null,
    });
    if (recordError)
      console.error("auction_record_refund_result failed", { refund: row.refund_id, code: recordError.code });
    results.push({ refundId: row.refund_id, result: recordError ? "RECORD_FAILED" : String(result) });
  }
  return results;
}
