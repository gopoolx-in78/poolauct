"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import type { FormState } from "@/modules/core/validation";
import { getActiveProvider } from "@/modules/payments/server/registry";
import { poolxErrorMessage } from "@/modules/poolx/types";
import { poolRequestSchema } from "@/modules/poolx/validation";
import { fieldErrors } from "@/modules/core/validation";
import { paise } from "@/lib/money";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Join a pool: the database computes the amount and creates (or reuses) a single payment attempt; the server then
 * creates the provider order and sends the user to checkout. Membership becomes ACTIVE only on a verified webhook.
 */
export async function joinPoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = slugSchema.safeParse(str(formData, "slug"));
  const poolId = z.uuid().safeParse(str(formData, "poolId"));
  const quantity = z.coerce.number().int().min(1).max(10_000).safeParse(str(formData, "quantity"));
  if (!slug.success || !poolId.success) return { status: "error", message: "That pool could not be found." };
  if (!quantity.success) return { status: "error", fieldErrors: { quantity: "Enter a whole number." } };

  await requireAccount(`/poolx/pools/${slug.data}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("poolx_start_contribution", { p_pool: poolId.data, p_quantity: quantity.data });
  if (error) return { status: "error", message: poolxErrorMessage(error.message) };

  const result = data as { status: string; attemptId?: string; amountPaise?: string; hasOrder?: boolean };
  if (result.status === "ALREADY_MEMBER") redirect(`/poolx/pools/${slug.data}?notice=already-member`);
  const attemptId = result.attemptId!;

  const provider = getActiveProvider();
  if (!result.hasOrder) {
    const order = await provider.createOrder({
      attemptId,
      amountPaise: paise(result.amountPaise!),
      currency: "INR",
      receipt: `poolx-${attemptId.slice(0, 8)}`,
    });
    const { error: attachError } = await createSupabaseAdminClient().schema("api").rpc("payments_attach_order", {
      p_attempt: attemptId,
      p_provider: provider.name,
      p_provider_order_id: order.providerOrderId,
    });
    if (attachError) {
      console.error("payments_attach_order failed", { code: attachError.code });
      return { status: "error", message: "We couldn’t start the payment. Please try again." };
    }
  }
  redirect(provider.name === "sandbox" ? `/payments/sandbox/${attemptId}` : "/account/poolx");
}

export async function withdrawFromPoolAction(formData: FormData) {
  const poolId = z.uuid().safeParse(str(formData, "poolId"));
  await requireAccount("/account/poolx");
  if (!poolId.success || str(formData, "confirm") !== "on") redirect("/account/poolx?error=WITHDRAW_UNCONFIRMED");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("poolx_withdraw", { p_pool: poolId.data });
  if (error) redirect(`/account/poolx?error=${encodeURIComponent(error.message.split(":")[0] ?? "ERROR")}`);
  redirect("/account/poolx?notice=withdrawn");
}

export async function submitPoolRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccount("/poolx/request");
  const raw = Object.fromEntries(
    [
      "title",
      "product",
      "description",
      "category",
      "estimatedQuantity",
      "targetParticipants",
      "expectedUnitPrice",
      "specifications",
      "preferredSeller",
      "deliveryLocation",
      "neededBy",
    ].map((k) => [k, str(formData, k)]),
  );
  const parsed = poolRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("poolx_submit_request", {
    p_title: d.title,
    p_product: d.product,
    p_description: d.description,
    p_category_slug: d.category || null,
    p_estimated_quantity: d.estimatedQuantity ?? null,
    p_target_participants: d.targetParticipants ?? null,
    p_expected_unit_price_paise:
      d.expectedUnitPrice === null ? null : (d.expectedUnitPrice.toString() as unknown as number),
    p_specifications: d.specifications || null,
    p_preferred_seller: d.preferredSeller || null,
    p_delivery_location: d.deliveryLocation,
    p_needed_by: d.neededBy || null,
  });
  if (error) return { status: "error", message: poolxErrorMessage(error.message), values: raw };
  redirect("/account/poolx?notice=request-submitted");
}
