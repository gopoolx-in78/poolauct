"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { fieldErrors, type FormState } from "@/modules/core/validation";
import { validateTiers } from "@/modules/poolx/pricing";
import { adminPoolSchema } from "@/modules/poolx/validation";

const POOL_FIELDS = [
  "slug",
  "title",
  "summary",
  "description",
  "productName",
  "specs",
  "categorySlug",
  "sellerId",
  "unitLabel",
  "basePrice",
  "referencePrice",
  "referenceSource",
  "tierBasis",
  "minQty",
  "maxQty",
  "minMembers",
  "targetMembers",
  "maxMembers",
  "platformFeePercent",
  "withdrawalPolicy",
  "terms",
  "deliveryNote",
  "startsAt",
  "deadlineAt",
] as const;

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function sqlError(message: string | undefined) {
  const code = message?.split(":")[0];
  if (message?.includes("pools_slug_key")) return "That slug is already used by another pool.";
  if (code === "NOT_EDITABLE") return "Only draft pools can be edited.";
  if (code === "FORBIDDEN") return "You don’t have permission to do that.";
  return message?.includes(":") ? message.split(":").slice(1).join(":").trim() : "The pool could not be saved.";
}

export async function savePoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const poolId = str(formData, "poolId");
  await requireStaff(poolId ? `/admin/poolx/${poolId}` : "/admin/poolx/new", "poolx.pools.manage");
  const raw = Object.fromEntries(POOL_FIELDS.map((k) => [k, str(formData, k)]));
  const parsed = adminPoolSchema.safeParse(raw);
  if (!parsed.success)
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
      values: raw,
    };
  const d = parsed.data;

  const payload = {
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    description: d.description,
    productName: d.productName,
    specs: d.specs,
    categorySlug: d.categorySlug,
    sellerId: d.sellerId,
    unitLabel: d.unitLabel,
    baseUnitPricePaise: d.basePrice!.toString(),
    referencePricePaise: d.referencePrice?.toString() ?? "",
    referencePriceSource: d.referenceSource,
    tierBasis: d.tierBasis,
    minQtyPerMember: d.minQty,
    maxQtyPerMember: d.maxQty,
    minMembers: d.minMembers,
    targetMembers: d.targetMembers,
    maxMembers: d.maxMembers ?? "",
    platformFeeBps: d.platformFeePercent,
    withdrawalPolicy: d.withdrawalPolicy,
    terms: d.terms,
    deliveryNote: d.deliveryNote,
    startsAt: d.startsAt,
    deadlineAt: d.deadlineAt,
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("poolx_admin_save_pool", { p_pool: poolId || null, p: payload });
  if (error) return { status: "error", message: sqlError(error.message), values: raw };
  revalidatePath("/admin/poolx");
  redirect(`/admin/poolx/${data as string}?notice=saved`);
}

export async function saveTiersAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const poolId = z.uuid().parse(str(formData, "poolId"));
  await requireStaff(`/admin/poolx/${poolId}`, "poolx.tiers.manage");
  const tiers: { threshold: number; discountBps: number }[] = [];
  // Echo what was typed so React's post-action form reset doesn't wipe the admin's input.
  const values: Record<string, string> = {};
  for (let i = 0; i < 10; i++) {
    const t = str(formData, `threshold_${i}`).trim();
    const pct = str(formData, `discount_${i}`).trim();
    values[`threshold_${i}`] = t;
    values[`discount_${i}`] = pct;
    if (!t && !pct) continue;
    const threshold = Number(t);
    const bps = Math.round(Number(pct) * 100);
    if (!t || !pct || !Number.isInteger(threshold) || !Number.isFinite(bps)) {
      return { status: "error", message: `Row ${i + 1}: enter a whole-number threshold and a percentage.`, values };
    }
    tiers.push({ threshold, discountBps: bps });
  }
  const problem = validateTiers(tiers);
  if (problem) return { status: "error", message: problem, values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("poolx_admin_set_tiers", { p_pool: poolId, p_tiers: tiers });
  if (error)
    return {
      status: "error",
      message: error.code === "23514" ? "Each higher threshold needs a bigger discount." : sqlError(error.message),
      values,
    };
  revalidatePath(`/admin/poolx/${poolId}`);
  return { status: "success", message: `Saved ${tiers.length} tier${tiers.length === 1 ? "" : "s"}.`, values };
}

export async function publishPoolAction(formData: FormData) {
  const poolId = z.uuid().parse(str(formData, "poolId"));
  await requireStaff(`/admin/poolx/${poolId}`, "poolx.pools.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("poolx_admin_publish", { p_pool: poolId });
  redirect(
    `/admin/poolx/${poolId}?${error ? `error=${encodeURIComponent(sqlError(error.message))}` : "notice=published"}`,
  );
}

export async function cancelPoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const poolId = z.uuid().parse(str(formData, "poolId"));
  await requireStaff(`/admin/poolx/${poolId}`, "poolx.pools.manage");
  const reason = str(formData, "reason").trim();
  if (str(formData, "confirm") !== "on")
    return { status: "error", fieldErrors: { confirm: "Confirm the cancellation." }, values: { reason } };
  if (reason.length < 5)
    return { status: "error", fieldErrors: { reason: "Give a reason (at least 5 characters)." }, values: { reason } };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("poolx_admin_cancel", { p_pool: poolId, p_reason: reason });
  if (error) return { status: "error", message: sqlError(error.message), values: { reason } };
  revalidatePath(`/admin/poolx/${poolId}`);
  const refunds = (data as { refunds: number }).refunds;
  return { status: "success", message: `Pool cancelled. ${refunds} full refund${refunds === 1 ? "" : "s"} queued.` };
}

export async function createSellerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff("/admin/poolx", "poolx.pools.manage");
  const name = str(formData, "sellerName").trim();
  if (name.length < 2 || name.length > 120)
    return { status: "error", fieldErrors: { sellerName: "Enter a seller name (2–120 characters)." } };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("poolx_admin_create_seller", { p_name: name });
  if (error) return { status: "error", message: sqlError(error.message) };
  revalidatePath("/admin/poolx", "layout");
  return { status: "success", message: `Seller “${name}” added (unverified). Reload the pool form to select it.` };
}

export async function reviewRequestAction(formData: FormData) {
  await requireStaff("/admin/poolx/requests", "poolx.requests.review");
  const id = z.uuid().parse(str(formData, "requestId"));
  const decision = z.enum(["UNDER_REVIEW", "APPROVED", "REJECTED"]).parse(str(formData, "decision"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("poolx_admin_review_request", { p_request: id, p_decision: decision, p_note: str(formData, "note") });
  redirect(
    `/admin/poolx/requests?${error ? `error=${encodeURIComponent(sqlError(error.message))}` : "notice=reviewed"}`,
  );
}
