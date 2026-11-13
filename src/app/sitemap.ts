import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * Public, indexable pages only. Pool, auction, category and blog URLs are appended from the
 * database once those modules exist (Phases 3, 4 and 7).
 */
export const staticPublicPaths = ["/", "/poolx", "/auctions", "/how-it-works", "/about", "/contact"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return staticPublicPaths.map((path) => ({
    url: new URL(path, site.url).toString(),
    changeFrequency: path === "/" || path === "/poolx" || path === "/auctions" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/poolx" || path === "/auctions" ? 0.9 : 0.5,
  }));
}
