import { publicEnv } from "@/lib/env";

/**
 * Site identity. The parent brand, domain and company details are owner decisions (OD-01) and are
 * read from configuration — never invented. Until configured, a neutral descriptive name is used.
 */
export const site = {
  name: publicEnv.NEXT_PUBLIC_BRAND_NAME ?? "PoolX & Auctions",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  description:
    "Two marketplaces in one place: join PoolX buying pools to unlock bulk prices together, or bid in online auctions for used cars and other second-hand assets.",
  locale: "en_IN",
  brandConfigured: Boolean(publicEnv.NEXT_PUBLIC_BRAND_NAME),
} as const;

export type NavItem = { href: string; label: string };

// The main menu, footer links and banners are part of the published site design (theme manager, Phase 7):
// see DEFAULT_THEME in src/modules/theme/schema.ts for the shipped defaults.
