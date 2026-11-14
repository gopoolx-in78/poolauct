import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { site } from "@/config/site";
import { readAll } from "@/lib/read-all";
import { listCategories, listPools } from "@/modules/poolx/server/queries";
import { listAuctionCategories, listAuctions } from "@/modules/auction/server/queries";
import { getPublicDocuments, getPublicFaqs } from "@/modules/cms/server/queries";

/** Public, indexable pages only. Pools, auctions and categories come from the database. */
export const staticPublicPaths = [
  "/",
  "/poolx",
  "/poolx/pools",
  "/auctions",
  "/auctions/browse",
  "/auctions/sell",
  "/how-it-works",
  "/about",
  "/contact",
] as const;

/** Most URLs per listing type; a sitemap file may hold 50,000 in total. */
const MAX_PER_TYPE = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const fixed: MetadataRoute.Sitemap = staticPublicPaths.map((path) => ({
    url: new URL(path, site.url).toString(),
    changeFrequency: path === "/" || path.startsWith("/poolx") || path === "/auctions" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/poolx" || path === "/auctions" ? 0.9 : 0.5,
  }));

  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const [categories, pools, auctionCategories, auctions, posts, pages, faqs] = await Promise.all([
      listCategories(),
      readAll((limit, offset) => listPools({ limit, offset }), 48, MAX_PER_TYPE),
      listAuctionCategories(),
      readAll((limit, offset) => listAuctions({ view: "all", limit, offset }), 48, MAX_PER_TYPE),
      readAll((limit, offset) => getPublicDocuments("POST", limit, offset), 100, MAX_PER_TYPE),
      readAll((limit, offset) => getPublicDocuments("PAGE", limit, offset), 100, MAX_PER_TYPE),
      getPublicFaqs(),
    ]);
    // FAQ and blog index pages are listed only once they have published content (they are noindex while empty).
    dynamic = [
      ...(faqs.length > 0
        ? [{ url: new URL("/faq", site.url).toString(), changeFrequency: "monthly" as const, priority: 0.5 }]
        : []),
      ...(posts.length > 0
        ? [{ url: new URL("/blog", site.url).toString(), changeFrequency: "weekly" as const, priority: 0.5 }]
        : []),
      ...posts.map((d) => ({
        url: new URL(`/blog/${d.slug}`, site.url).toString(),
        lastModified: d.publishedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
      ...pages.map((d) => ({
        url: new URL(`/info/${d.slug}`, site.url).toString(),
        lastModified: d.publishedAt,
        changeFrequency: "monthly" as const,
        priority: 0.4,
      })),
      ...categories.map((c) => ({
        url: new URL(`/poolx/categories/${c.slug}`, site.url).toString(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
      ...pools.map((p) => ({
        url: new URL(`/poolx/pools/${p.slug}`, site.url).toString(),
        changeFrequency: "hourly" as const,
        priority: 0.8,
      })),
      ...auctionCategories.map((c) => ({
        url: new URL(`/auctions/category/${c.slug}`, site.url).toString(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
      ...auctions.map((a) => ({
        url: new URL(`/auctions/${a.slug}`, site.url).toString(),
        changeFrequency: "hourly" as const,
        priority: 0.8,
      })),
    ];
  } catch (e) {
    // The sitemap must still serve if the database is briefly unavailable.
    console.error("sitemap: dynamic entries unavailable", e instanceof Error ? e.message : e);
  }
  return [...fixed, ...dynamic];
}
