"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { paise } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { handlePaymentWebhook } from "@/modules/payments/server/process";
import { getProvider, isSandboxEnabled } from "@/modules/payments/server/registry";
import { SandboxProvider } from "@/modules/payments/server/sandbox";

/**
 * Test checkout: builds a provider-signed event and sends it through the SAME verification + processing path a real
 * webhook takes. Only the attempt's owner can do this, and only when the sandbox provider is enabled.
 */
export async function sandboxCompleteAction(formData: FormData) {
  if (!isSandboxEnabled()) notFound();
  const attemptId = z.uuid().parse(formData.get("attemptId"));
  const outcome = z.enum(["captured", "failed"]).parse(formData.get("outcome"));
  await requireAccount(`/payments/sandbox/${attemptId}`);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("payments_get_my_attempt", { p_attempt: attemptId });
  const attempt = data as {
    amountPaise: string;
    providerOrderId: string | null;
    status: string;
    pool: { slug: string } | null;
    auction: { slug: string; kind: "deposit" | "purchase" } | null;
  } | null;
  if (!attempt?.providerOrderId) notFound();

  const sandbox = getProvider("sandbox") as SandboxProvider;
  const { body, headers } = sandbox.checkoutEvent(outcome, attempt.providerOrderId, paise(attempt.amountPaise));
  const result = await handlePaymentWebhook("sandbox", body, new Headers(headers));
  if (!result.ok) console.error("sandbox checkout processing failed", result);

  const back = attempt.pool
    ? `/poolx/pools/${attempt.pool.slug}`
    : attempt.auction?.kind === "deposit"
      ? `/auctions/${attempt.auction.slug}`
      : attempt.auction
        ? "/account/auctions"
        : "/account";
  redirect(`${back}?payment=${outcome === "captured" ? "success" : "failed"}`);
}
