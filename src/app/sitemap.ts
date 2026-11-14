import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { site } from "@/config/site";
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
      listPools({ limit: 48 }),
      listAuctionCategories(),
      listAuctions({ view: "all", limit: 48 }),
      getPublicDocuments("POST", 100, 0),
      getPublicDocuments("PAGE", 100, 0),
      getPublicFaqs(),
    ]);
    // FAQ and blog index pages are listed only once they have published content (they are noindex while empty).
    dynamic = [
      ...(faqs.length > 0
        ? [{ url: new URL("/faq", site.url).toString(), changeFrequency: "monthly" as const, priority: 0.5 }]
        : []),
      ...(posts.total > 0
        ? [{ url: new URL("/blog", site.url).toString(), changeFrequency: "weekly" as const, priority: 0.5 }]
        : []),
      ...posts.items.map((d) => ({
        url: new URL(`/blog/${d.slug}`, site.url).toString(),
        lastModified: d.publishedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
      ...pages.items.map((d) => ({
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
      ...pools.items.map((p) => ({
        url: new URL(`/poolx/pools/${p.slug}`, site.url).toString(),
        changeFrequency: "hourly" as const,
        priority: 0.8,
      })),
      ...auctionCategories.map((c) => ({
        url: new URL(`/auctions/category/${c.slug}`, site.url).toString(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
      ...auctions.items.map((a) => ({
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
