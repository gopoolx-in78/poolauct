"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { fieldErrors, type FormState } from "@/modules/core/validation";
import { LISTING_FIELDS, listingSchema, toListingPayload } from "@/modules/auction/validation";
import { rupeesToPaise } from "@/modules/poolx/validation";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function sqlMessage(message: string | undefined) {
  if (message?.includes("auctions_slug_key")) return "That URL slug is already used.";
  const code = message?.split(":")[0];
  if (code === "FORBIDDEN") return "You don’t have permission to do that.";
  return message?.includes(":") ? message.split(":").slice(1).join(":").trim() : "That action could not be completed.";
}

export async function saveListingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const auctionId = str(formData, "auctionId");
  await requireStaff(auctionId ? `/admin/auctions/${auctionId}` : "/admin/auctions/new", "auction.listings.manage");
  const raw = Object.fromEntries(LISTING_FIELDS.map((k) => [k, str(formData, k)]));
  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success)
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
      values: raw,
    };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("auction_admin_save_listing", { p_auction: auctionId || null, p: toListingPayload(parsed.data) });
  if (error) return { status: "error", message: sqlMessage(error.message), values: raw };
  revalidatePath("/admin/auctions");
  redirect(`/admin/auctions/${data as string}?notice=saved`);
}

function back(id: string, error?: { message?: string } | null, notice?: string) {
  return `/admin/auctions/${id}?${error ? `error=${encodeURIComponent(sqlMessage(error.message))}` : `notice=${notice}`}`;
}

export async function publishAuctionAction(formData: FormData) {
  const id = z.uuid().parse(str(formData, "auctionId"));
  await requireStaff(`/admin/auctions/${id}`, "auction.listings.approve");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("auction_admin_publish", { p_auction: id });
  redirect(back(id, error, "published"));
}

export async function cancelAuctionAction(formData: FormData) {
  const id = z.uuid().parse(str(formData, "auctionId"));
  await requireStaff(`/admin/auctions/${id}`, "auction.cancel");
  if (str(formData, "confirm") !== "on")
    redirect(back(id, { message: "CONFIRM: Tick the box to confirm cancellation." }));
  const kind = z.enum(["ADMIN", "SELLER_WITHDREW"]).parse(str(formData, "kind"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("auction_admin_cancel", { p_auction: id, p_kind: kind, p_reason: str(formData, "reason") });
  redirect(back(id, error, "cancelled"));
}

export async function closeAuctionAction(formData: FormData) {
  const id = z.uuid().parse(str(formData, "auctionId"));
  await requireStaff(`/admin/auctions/${id}`, "auction.close.force");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("auction_admin_close", { p_auction: id });
  redirect(back(id, error, "closed"));
}

export async function retryRefundAction(formData: FormData) {
  await requireStaff("/admin/auctions/deposits", "auction.deposit.refund.retry");
  const refundId = z.uuid().parse(str(formData, "refundId"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("auction_admin_retry_refund", { p_refund: refundId, p_reason: str(formData, "reason") });
  redirect(
    `/admin/auctions/deposits?${error ? `error=${encodeURIComponent(sqlMessage(error.message))}` : "notice=retry-scheduled"}`,
  );
}

export async function saveDepositPolicyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff("/admin/auctions/policy", "auction.deposit.config");
  const values = { min: str(formData, "min"), max: str(formData, "max"), reason: str(formData, "reason") };
  const min = rupeesToPaise.safeParse(values.min);
  const max = rupeesToPaise.safeParse(values.max);
  if (!min.success || min.data === null || min.data <= 0n)
    return { status: "error", fieldErrors: { min: "The minimum deposit must be above ₹0." }, values };
  if (!max.success)
    return { status: "error", fieldErrors: { max: "Enter an amount in rupees or leave blank." }, values };
  if (max.data !== null && max.data < min.data)
    return { status: "error", fieldErrors: { max: "Must be at least the minimum." }, values };
  if (values.reason.trim().length < 5)
    return { status: "error", fieldErrors: { reason: "Give a reason for the change." }, values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("auction_admin_set_deposit_policy", {
    p_min_paise: min.data.toString() as unknown as number,
    p_max_paise: max.data === null ? null : (max.data.toString() as unknown as number),
    p_reason: values.reason,
  });
  if (error) return { status: "error", message: sqlMessage(error.message), values };
  revalidatePath("/admin/auctions/policy");
  return { status: "success", message: "Deposit policy saved. It applies to auctions published from now on.", values };
}

export async function decideDefaultAction(formData: FormData) {
  await requireStaff("/admin/auctions/defaults", "auction.default.review");
  const reviewId = z.uuid().parse(str(formData, "reviewId"));
  const decision = z.enum(["EXTEND", "REFUND", "FORFEIT"]).parse(str(formData, "decision"));
  const hours = str(formData, "extendHours");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("auction_admin_decide_default", {
    p_review: reviewId,
    p_decision: decision,
    p_reason: str(formData, "reason"),
    p_extend_hours: decision === "EXTEND" ? Number(hours) || 0 : null,
  });
  const status = (data as { status?: string } | null)?.status;
  revalidatePath("/admin/auctions/defaults");
  redirect(
    `/admin/auctions/defaults?${error ? `error=${encodeURIComponent(sqlMessage(error.message))}` : `notice=${status === "AWAITING_SECOND_APPROVER" ? "awaiting-second" : "decided"}`}`,
  );
}
