import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { AuctionDetail, AuctionList } from "../types";

export const AUCTION_VIEWS = ["all", "live", "upcoming", "ending", "recent", "closed"] as const;
export type AuctionView = (typeof AUCTION_VIEWS)[number];

export async function listAuctions(opts: {
  view?: AuctionView;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("auction_list", {
      p_view: opts.view ?? "all",
      p_category: opts.category ?? null,
      p_search: opts.search ?? null,
      p_limit: opts.limit ?? 12,
      p_offset: opts.offset ?? 0,
    });
  if (error) throw new Error(`auction_list failed: ${error.code}`);
  return data as AuctionList;
}

export async function getAuction(slug: string): Promise<AuctionDetail | null> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("auction_get", { p_slug: slug });
  if (error) throw new Error(`auction_get failed: ${error.code}`);
  return (data as AuctionDetail | null) ?? null;
}

export async function getBidHistory(slug: string) {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("auction_bid_history", { p_slug: slug });
  if (error) throw new Error(`auction_bid_history failed: ${error.code}`);
  return (data ?? []) as { bidder: string; amountPaise: string; at: string }[];
}

export async function listAuctionCategories() {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("auction_list_categories");
  if (error) throw new Error(`auction_list_categories failed: ${error.code}`);
  return (data ?? []) as { slug: string; name: string; isVehicle: boolean }[];
}

export async function getAuctionStats() {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("auction_public_stats");
  if (error) throw new Error(`auction_public_stats failed: ${error.code}`);
  return data as { live: number; upcoming: number };
}
