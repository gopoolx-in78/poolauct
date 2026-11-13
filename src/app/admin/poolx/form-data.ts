import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/modules/poolx/server/queries";
import type { PoolDetail } from "@/modules/poolx/types";
import type { PoolFormValues } from "./pool-form";

/** ISO instant → value for <input type="datetime-local"> in IST. */
export function toIstLocal(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}

function paiseToRupeesString(v: string | null | undefined) {
  if (!v) return "";
  const n = BigInt(v);
  const whole = n / 100n;
  const frac = n % 100n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0")}`;
}

export async function loadFormOptions() {
  const supabase = await createSupabaseServerClient();
  const [categories, sellers] = await Promise.all([
    listCategories(),
    supabase.schema("api").rpc("poolx_admin_list_sellers"),
  ]);
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    sellers: (sellers.data ?? []) as { id: string; name: string; verificationStatus: string }[],
  };
}

export function emptyPoolValues(nowIso: string): PoolFormValues {
  const start = toIstLocal(nowIso);
  const deadline = toIstLocal(new Date(new Date(nowIso).getTime() + 14 * 86_400_000).toISOString());
  return {
    slug: "",
    title: "",
    summary: "",
    description: "",
    productName: "",
    specs: "",
    categorySlug: "",
    sellerId: "",
    unitLabel: "unit",
    basePrice: "",
    referencePrice: "",
    referenceSource: "",
    tierBasis: "MEMBERS",
    minQty: "1",
    maxQty: "1",
    minMembers: "1",
    targetMembers: "10",
    maxMembers: "",
    platformFeePercent: "0",
    withdrawalPolicy: "You can withdraw while the pool is open; your full contribution is refunded.",
    terms: "",
    deliveryNote: "",
    startsAt: start,
    deadlineAt: deadline,
  };
}

export function poolToValues(p: PoolDetail & { sellerId?: string | null }): PoolFormValues {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    description: p.description,
    productName: p.productName,
    specs: p.specs.map((s) => `${s.label}: ${s.value}`).join("\n"),
    categorySlug: p.category?.slug ?? "",
    sellerId: p.sellerId ?? "",
    unitLabel: p.unitLabel,
    basePrice: paiseToRupeesString(p.baseUnitPricePaise),
    referencePrice: paiseToRupeesString(p.referencePricePaise),
    referenceSource: p.referencePriceSource ?? "",
    tierBasis: p.tierBasis,
    minQty: String(p.minQtyPerMember),
    maxQty: String(p.maxQtyPerMember),
    minMembers: String(p.minMembers),
    targetMembers: String(p.targetMembers),
    maxMembers: p.maxMembers ? String(p.maxMembers) : "",
    platformFeePercent: String(p.platformFeeBps / 100),
    withdrawalPolicy: p.withdrawalPolicy,
    terms: p.terms,
    deliveryNote: p.deliveryNote ?? "",
    startsAt: toIstLocal(p.startsAt),
    deadlineAt: toIstLocal(p.deadlineAt),
  };
}
