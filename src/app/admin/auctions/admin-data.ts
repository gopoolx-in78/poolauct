import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR, paise } from "@/lib/money";
import { listAuctionCategories } from "@/modules/auction/server/queries";

/** Values at or above this are the "no cap" sentinel stored by auction_admin_set_deposit_policy. */
export const NO_CAP_PAISE = 100000000000000n;

export type DepositPolicy = {
  globalMinPaise: string | null;
  globalMaxPaise: string | null;
  bidderVerificationLevel: string;
};

export async function loadDepositPolicy(): Promise<DepositPolicy | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("auction_admin_get_deposit_policy");
  return (data as DepositPolicy | null) ?? null;
}

export function policyLabels(p: DepositPolicy | null) {
  const min = p?.globalMinPaise ? formatINR(paise(p.globalMinPaise)) : null;
  const max = p?.globalMaxPaise && BigInt(p.globalMaxPaise) < NO_CAP_PAISE ? formatINR(paise(p.globalMaxPaise)) : null;
  return { minLabel: min, maxLabel: max };
}

export async function loadListingOptions() {
  const [categories, policy] = await Promise.all([listAuctionCategories(), loadDepositPolicy()]);
  return { categories, depositPolicy: policyLabels(policy) };
}
