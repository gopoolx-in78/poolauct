import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Media } from "@/modules/core/media";
import type { Category, PoolDetail, PoolList } from "../types";

export const POOL_SORTS = ["ending", "popular", "newest"] as const;
export type PoolSort = (typeof POOL_SORTS)[number];

export async function listPools(opts: {
  search?: string;
  category?: string;
  sort?: PoolSort;
  limit?: number;
  offset?: number;
}): Promise<PoolList> {
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("poolx_list_pools", {
      p_search: opts.search ?? null,
      p_category: opts.category ?? null,
      p_sort: opts.sort ?? "ending",
      p_limit: opts.limit ?? 12,
      p_offset: opts.offset ?? 0,
    });
  if (error) throw new Error(`poolx_list_pools failed: ${error.code}`);
  const list = data as PoolList;
  const covers = await getPoolCovers(list.items.map((p) => p.slug));
  return { ...list, items: list.items.map((p) => ({ ...p, cover: covers[p.slug] ?? null })) };
}

/** Photos of a publicly visible pool, in order (TD-74). */
export async function getPoolMedia(slug: string): Promise<Media[]> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("poolx_pool_media", { p_slug: slug });
  if (error) throw new Error(`poolx_pool_media failed: ${error.code}`);
  return (data ?? []) as Media[];
}

async function getPoolCovers(slugs: string[]): Promise<Record<string, Media>> {
  if (slugs.length === 0) return {};
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("poolx_media_covers", { p_slugs: slugs });
  if (error) throw new Error(`poolx_media_covers failed: ${error.code}`);
  return (data ?? {}) as Record<string, Media>;
}

export async function getPool(slug: string): Promise<PoolDetail | null> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("poolx_get_pool", { p_slug: slug });
  if (error) throw new Error(`poolx_get_pool failed: ${error.code}`);
  return (data as PoolDetail | null) ?? null;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("poolx_list_categories");
  if (error) throw new Error(`poolx_list_categories failed: ${error.code}`);
  return (data ?? []) as Category[];
}

export async function getPublicStats(): Promise<{ openPools: number; activeMembers: number }> {
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("poolx_public_stats");
  if (error) throw new Error(`poolx_public_stats failed: ${error.code}`);
  return data as { openPools: number; activeMembers: number };
}
