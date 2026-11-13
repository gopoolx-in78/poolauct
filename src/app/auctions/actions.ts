"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { paise } from "@/lib/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import type { FormState } from "@/modules/core/validation";
import { auctionErrorMessage } from "@/modules/auction/types";
import { getActiveProvider } from "@/modules/payments/server/registry";
import { rupeesToPaise } from "@/modules/poolx/validation";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(90);

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Creates the provider order for an attempt (if needed) and sends the user to checkout. */
async function toCheckout(
  result: { attemptId?: string; amountPaise?: string; hasOrder?: boolean },
  receipt: string,
  fallback: string,
) {
  const attemptId = result.attemptId!;
  const provider = getActiveProvider();
  if (!result.hasOrder) {
    const order = await provider.createOrder({
      attemptId,
      amountPaise: paise(result.amountPaise!),
      currency: "INR",
      receipt,
    });
    const { error } = await createSupabaseAdminClient().schema("api").rpc("payments_attach_order", {
      p_attempt: attemptId,
      p_provider: provider.name,
      p_provider_order_id: order.providerOrderId,
    });
    if (error) {
      console.error("payments_attach_order failed", { code: error.code });
      return { status: "error", message: "We couldn’t start the payment. Please try again." } satisfies FormState;
    }
  }
  redirect(provider.name === "sandbox" ? `/payments/sandbox/${attemptId}` : fallback);
}

/** §7.2 steps 5–6: accept the terms, then start the mandatory refundable deposit payment. */
export async function startDepositAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = slugSchema.safeParse(str(formData, "slug"));
  const auctionId = z.uuid().safeParse(str(formData, "auctionId"));
  if (!slug.success || !auctionId.success) return { status: "error", message: "That auction could not be found." };
  await requireAccount(`/auctions/${slug.data}`);
  if (str(formData, "acceptTerms") !== "on") {
    return { status: "error", fieldErrors: { acceptTerms: "Accept the auction terms and deposit rules to continue." } };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("auction_start_deposit", { p_auction: auctionId.data, p_terms_version: str(formData, "termsVersion") });
  if (error) return { status: "error", message: auctionErrorMessage(error.message) };
  const result = data as { status: string; attemptId?: string; amountPaise?: string; hasOrder?: boolean };
  if (result.status === "ALREADY_PAID") redirect(`/auctions/${slug.data}`);
  return toCheckout(result, `auc-dep-${result.attemptId!.slice(0, 8)}`, `/auctions/${slug.data}`);
}

/** §8.1: the server validates everything; the amount typed here is only a request. */
export async function placeBidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = slugSchema.safeParse(str(formData, "slug"));
  const auctionId = z.uuid().safeParse(str(formData, "auctionId"));
  const key = z.string().min(8).max(100).safeParse(str(formData, "idempotencyKey"));
  const raw = str(formData, "amount");
  if (!slug.success || !auctionId.success || !key.success)
    return { status: "error", message: "Please refresh the page and try again." };
  await requireAccount(`/auctions/${slug.data}`);
  const amount = rupeesToPaise.safeParse(raw);
  if (!amount.success || amount.data === null) {
    return { status: "error", fieldErrors: { amount: "Enter your bid in rupees." }, values: { amount: raw } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("auction_place_bid", {
    p_auction: auctionId.data,
    p_amount_paise: amount.data.toString() as unknown as number,
    p_idempotency_key: key.data,
  });
  if (error) return { status: "error", message: auctionErrorMessage(error.message), values: { amount: raw } };
  redirect(`/auctions/${slug.data}?bid=accepted`);
}

export async function payInvoiceAction(formData: FormData) {
  const invoiceId = z.uuid().safeParse(str(formData, "invoiceId"));
  await requireAccount("/account/auctions");
  if (!invoiceId.success) redirect("/account/auctions?error=INVOICE_NOT_FOUND");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("auction_start_invoice_payment", { p_invoice: invoiceId.data });
  if (error) redirect(`/account/auctions?error=${encodeURIComponent(error.message.split(":")[0] ?? "ERROR")}`);
  const result = data as { attemptId?: string; amountPaise?: string; hasOrder?: boolean };
  await toCheckout(result, `auc-inv-${result.attemptId!.slice(0, 8)}`, "/account/auctions");
}
