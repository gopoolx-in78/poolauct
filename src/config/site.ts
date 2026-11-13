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

/** Main menu (master prompt §4). Every entry must resolve to a real page. */
export const mainNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/poolx", label: "PoolX" },
  { href: "/auctions", label: "Auctions" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];
