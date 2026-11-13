import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
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
  return data as PoolList;
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
