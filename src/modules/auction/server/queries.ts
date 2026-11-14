import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Media } from "@/modules/core/media";
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
  const list = data as AuctionList;
  const covers = await getAuctionCovers(list.items.map((a) => a.slug));
  return { ...list, items: list.items.map((a) => ({ ...a, cover: covers[a.slug] ?? null })) };
}

/** Published listing photos, in order (TD-74). */
export async function getAuctionMedia(slug: string): Promise<Media[]> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("auction_media", { p_slug: slug });
  if (error) throw new Error(`auction_media failed: ${error.code}`);
  return (data ?? []) as Media[];
}

async function getAuctionCovers(slugs: string[]): Promise<Record<string, Media>> {
  if (slugs.length === 0) return {};
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("auction_media_covers", { p_slugs: slugs });
  if (error) throw new Error(`auction_media_covers failed: ${error.code}`);
  return (data ?? {}) as Record<string, Media>;
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
