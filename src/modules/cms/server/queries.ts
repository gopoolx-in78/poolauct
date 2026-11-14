import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { DEFAULT_THEME, parseThemeConfig, type ThemeConfig } from "@/modules/theme/schema";

/** Cache tags invalidated by the CMS admin actions (updateTag) so publishes show immediately. */
export const CMS_TAGS = {
  site: "cms-site",
  faqs: "cms-faqs",
  docs: "cms-docs",
  seo: "cms-seo",
} as const;

export type SiteDesign = { config: ThemeConfig; version: number | null; publishedAt: string | null };

/** The published site design, or the shipped default when none is published / the database is unreachable. */
export async function getSiteDesign(): Promise<SiteDesign> {
  "use cache";
  cacheTag(CMS_TAGS.site);
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("cms_public_site");
  if (error) {
    cacheLife("minutes"); // don't pin a fallback for long
    return { config: DEFAULT_THEME, version: null, publishedAt: null };
  }
  cacheLife("hours");
  const row = data as { version: number; publishedAt: string; config: unknown } | null;
  if (!row) return { config: DEFAULT_THEME, version: null, publishedAt: null };
  return { config: parseThemeConfig(row.config), version: row.version, publishedAt: row.publishedAt };
}

export type Faq = { id: string; topic: "general" | "poolx" | "auction"; question: string; answer: string };

export async function getPublicFaqs(): Promise<Faq[]> {
  "use cache";
  cacheTag(CMS_TAGS.faqs);
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("cms_public_faqs");
  if (error) {
    cacheLife("minutes");
    return [];
  }
  cacheLife("hours");
  return (data ?? []) as Faq[];
}

export type DocumentKind = "PAGE" | "POST";
export type DocumentSummary = {
  slug: string;
  title: string;
  summary: string;
  firstPublishedAt: string;
  publishedAt: string;
};
export type PublicDocument = DocumentSummary & {
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function getPublicDocuments(
  kind: DocumentKind,
  limit: number,
  offset: number,
): Promise<{ total: number; items: DocumentSummary[] }> {
  "use cache";
  cacheTag(CMS_TAGS.docs);
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("cms_public_documents", { p_kind: kind, p_limit: limit, p_offset: offset });
  if (error) {
    cacheLife("minutes");
    return { total: 0, items: [] };
  }
  cacheLife("hours");
  return (data ?? { total: 0, items: [] }) as { total: number; items: DocumentSummary[] };
}

export async function getPublicDocument(kind: DocumentKind, slug: string): Promise<PublicDocument | null> {
  "use cache";
  cacheTag(CMS_TAGS.docs);
  const { data, error } = await createSupabasePublicClient()
    .schema("api")
    .rpc("cms_public_document", { p_kind: kind, p_slug: slug });
  if (error) {
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  return (data ?? null) as PublicDocument | null;
}

export const SEO_ROUTES = ["home", "poolx", "auctions", "how-it-works", "about", "contact", "faq", "blog"] as const;
export type SeoRoute = (typeof SEO_ROUTES)[number];
export type SeoOverride = { title: string | null; description: string | null };

export async function getSeoOverrides(): Promise<Partial<Record<SeoRoute, SeoOverride>>> {
  "use cache";
  cacheTag(CMS_TAGS.seo);
  const { data, error } = await createSupabasePublicClient().schema("api").rpc("cms_public_seo");
  if (error) {
    cacheLife("minutes");
    return {};
  }
  cacheLife("hours");
  return (data ?? {}) as Partial<Record<SeoRoute, SeoOverride>>;
}

/** Applies an SEO override (title / description) for a route to default metadata values. */
export async function seoFor(route: SeoRoute, defaults: { title: string; description: string }) {
  const o = (await getSeoOverrides())[route];
  return { title: o?.title ?? defaults.title, description: o?.description ?? defaults.description };
}
