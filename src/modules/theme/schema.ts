import { z } from "zod";

/**
 * Site-design document (theme tokens + homepage + navigation + footer + banners).
 * Mirrors cms.theme_config_problem() in migration 0013 exactly — the database is the final gate; this gives the editor
 * friendly messages first. Every key is allowlisted (strict objects); values are enums, #rrggbb colours, internal paths
 * or plain text. Nothing here can carry CSS, HTML, scripts or external URLs.
 */

export const PALETTE_KEYS = [
  "paper",
  "surface",
  "secondary",
  "ink",
  "inkMuted",
  "rule",
  "primary",
  "primaryInk",
  "accent",
  "poolx",
  "poolxInk",
  "auction",
  "auctionInk",
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const HOME_SECTIONS = ["hero", "marketplaces", "principles", "how", "faq", "blog"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export const DISPLAY_FONTS = ["fraunces", "plex-serif", "plex-sans"] as const;
export const TEXT_FONTS = ["plex-sans", "plex-serif"] as const;
export const SCALES = ["compact", "standard", "large"] as const;
export const RADII = [0, 2, 4, 6, 8, 12] as const;
export const HEADER_LAYOUTS = ["classic", "centered", "split"] as const;
export const FOOTER_LAYOUTS = ["columns", "compact"] as const;
export const HERO_STYLES = ["plain", "tinted", "solid"] as const;
export const TEMPLATES = ["editorial", "bold", "minimal"] as const;
export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export const BANNER_TONES = ["info", "success", "warning"] as const;

/** Contrast pairs enforced per palette: [foreground, background, minimum ratio]. Same list as the SQL validator. */
export const CONTRAST_PAIRS: readonly [PaletteKey, PaletteKey, number][] = [
  ["ink", "paper", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "secondary", 4.5],
  ["inkMuted", "paper", 4.5],
  ["inkMuted", "surface", 4.5],
  ["inkMuted", "secondary", 4.5],
  ["primaryInk", "primary", 4.5],
  ["accent", "paper", 4.5],
  ["poolxInk", "poolx", 4.5],
  ["poolx", "paper", 4.5],
  ["poolx", "surface", 4.5],
  ["auctionInk", "auction", 4.5],
  ["auction", "paper", 4.5],
  ["auction", "surface", 4.5],
];

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const plain = (min: number, max: number, what: string) =>
  z
    .string()
    .min(min, `${what}: at least ${min} characters`)
    .max(max, `${what}: at most ${max} characters`)
    .refine((s) => !/[\u0000-\u001f\u007f<>]/.test(s), `${what}: plain text only (no < or >)`)
    .refine((s) => min === 0 || s.trim() !== "", `${what} is required`);

const INTERNAL_HREF = /^\/([a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*)?(#[a-z0-9][a-z0-9-]*)?$/;
export const internalHref = z
  .string()
  .max(120)
  .regex(INTERNAL_HREF, "Links must be internal paths such as /poolx or /how-it-works#auctions");

const hex = z.string().regex(/^#[0-9a-f]{6}$/, "Use a #rrggbb colour (lowercase)");

const palette = z.strictObject(Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex])) as Record<PaletteKey, typeof hex>);

const link = z.strictObject({ label: plain(1, 30, "Link text"), href: internalHref });

export const themeConfigSchema = z
  .strictObject({
    schema: z.literal(1),
    template: z.enum(TEMPLATES),
    colorScheme: z.enum(COLOR_SCHEMES),
    colors: z.strictObject({ light: palette, dark: palette }),
    fonts: z.strictObject({ display: z.enum(DISPLAY_FONTS), text: z.enum(TEXT_FONTS) }),
    type: z.strictObject({ headingScale: z.enum(SCALES), bodyScale: z.enum(SCALES) }),
    radius: z
      .number()
      .refine((n) => (RADII as readonly number[]).includes(n), "Corner radius must be 0, 2, 4, 6, 8 or 12"),
    header: z.strictObject({ layout: z.enum(HEADER_LAYOUTS), sticky: z.boolean() }),
    footer: z.strictObject({ layout: z.enum(FOOTER_LAYOUTS), tagline: plain(0, 160, "Footer tagline") }),
    nav: z.array(link).min(1, "Add at least one menu link").max(8, "Up to 8 menu links"),
    footerGroups: z
      .array(z.strictObject({ title: plain(1, 30, "Group title"), links: z.array(link).min(1).max(6) }))
      .max(4, "Up to 4 footer groups"),
    hero: z.strictObject({
      eyebrow: plain(0, 60, "Hero eyebrow"),
      heading: plain(1, 120, "Hero heading"),
      subheading: plain(0, 300, "Hero text"),
    }),
    modules: z.strictObject({
      poolx: z.strictObject({ visible: z.boolean(), heroStyle: z.enum(HERO_STYLES) }),
      auction: z.strictObject({ visible: z.boolean(), heroStyle: z.enum(HERO_STYLES) }),
    }),
    home: z.strictObject({
      sections: z
        .array(z.strictObject({ type: z.enum(HOME_SECTIONS), enabled: z.boolean() }))
        .length(HOME_SECTIONS.length)
        .refine((s) => new Set(s.map((x) => x.type)).size === s.length, "Each homepage section can appear only once")
        .refine((s) => s.find((x) => x.type === "hero")?.enabled === true, "The hero (page heading) must stay enabled"),
    }),
    banners: z
      .array(
        z
          .strictObject({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
            message: plain(1, 160, "Banner message"),
            linkLabel: plain(0, 40, "Banner link text"),
            href: internalHref.nullable(),
            tone: z.enum(BANNER_TONES),
            enabled: z.boolean(),
          })
          .refine((b) => (b.href === null) === (b.linkLabel === ""), "A banner link needs both text and a path"),
      )
      .max(3, "Up to 3 banners")
      .refine((b) => new Set(b.map((x) => x.id)).size === b.length, "Banner ids must be unique"),
  })
  .superRefine((c, ctx) => {
    for (const mode of ["light", "dark"] as const) {
      for (const [fg, bg, min] of CONTRAST_PAIRS) {
        const ratio = contrast(c.colors[mode][fg], c.colors[mode][bg]);
        if (ratio < min) {
          ctx.addIssue({
            code: "custom",
            path: ["colors", mode, fg],
            message: `Contrast too low in the ${mode} palette: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (needs ${min}:1)`,
          });
        }
      }
    }
  });

export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type Palette = ThemeConfig["colors"]["light"];

/** The shipped design (matches globals.css). Used until a version is published, and as the editor's starting point. */
export const DEFAULT_THEME: ThemeConfig = {
  schema: 1,
  template: "editorial",
  colorScheme: "system",
  colors: {
    light: {
      paper: "#f7f5f0",
      surface: "#ffffff",
      secondary: "#efebe3",
      ink: "#141412",
      inkMuted: "#55534d",
      rule: "#d9d5cc",
      primary: "#141412",
      primaryInk: "#f7f5f0",
      accent: "#1f5fad",
      poolx: "#0b7a57",
      poolxInk: "#ffffff",
      auction: "#c2410c",
      auctionInk: "#ffffff",
    },
    dark: {
      paper: "#0e0e0c",
      surface: "#181816",
      secondary: "#1d1c19",
      ink: "#f2f0ea",
      inkMuted: "#a8a59c",
      rule: "#2c2b27",
      primary: "#f2f0ea",
      primaryInk: "#0e0e0c",
      accent: "#7cb4ff",
      poolx: "#3ddc97",
      poolxInk: "#06281c",
      auction: "#ff8a4c",
      auctionInk: "#2a0e02",
    },
  },
  fonts: { display: "fraunces", text: "plex-sans" },
  type: { headingScale: "standard", bodyScale: "standard" },
  radius: 4,
  header: { layout: "classic", sticky: true },
  footer: { layout: "columns", tagline: "Group buying and online auctions — two marketplaces, one account." },
  nav: [
    { href: "/", label: "Home" },
    { href: "/poolx", label: "PoolX" },
    { href: "/auctions", label: "Auctions" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact Us" },
  ],
  footerGroups: [
    {
      title: "PoolX",
      links: [
        { href: "/poolx", label: "Buying pools" },
        { href: "/how-it-works#poolx", label: "How pooling works" },
      ],
    },
    {
      title: "Auctions",
      links: [
        { href: "/auctions", label: "Auctions" },
        { href: "/how-it-works#auctions", label: "How bidding works" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/about", label: "About Us" },
        { href: "/contact", label: "Contact Us" },
        { href: "/faq", label: "FAQ" },
      ],
    },
  ],
  hero: {
    eyebrow: "Two marketplaces · One account",
    heading: "Buy together for better prices. Bid for what’s worth having.",
    subheading:
      "Pool your demand with other buyers on PoolX, or take part in transparent online auctions for second-hand assets. Each marketplace runs on its own rules, with its own payments and records.",
  },
  modules: {
    poolx: { visible: true, heroStyle: "plain" },
    auction: { visible: true, heroStyle: "plain" },
  },
  home: {
    sections: [
      { type: "hero", enabled: true },
      { type: "marketplaces", enabled: true },
      { type: "principles", enabled: true },
      { type: "how", enabled: true },
      { type: "faq", enabled: false },
      { type: "blog", enabled: false },
    ],
  },
  banners: [],
};

type TemplatePatch = Pick<ThemeConfig, "fonts" | "type" | "radius" | "header" | "footer"> & {
  heroStyle: (typeof HERO_STYLES)[number];
};

/** Predefined layout templates. Applying one changes design settings only — never text, links or colours. */
export const TEMPLATE_PRESETS: Record<
  (typeof TEMPLATES)[number],
  { label: string; summary: string; patch: TemplatePatch }
> = {
  editorial: {
    label: "Editorial",
    summary: "Serif headlines, hairline rules, small corners.",
    patch: {
      fonts: { display: "fraunces", text: "plex-sans" },
      type: { headingScale: "standard", bodyScale: "standard" },
      radius: 4,
      header: { layout: "classic", sticky: true },
      footer: { layout: "columns", tagline: "" },
      heroStyle: "plain",
    },
  },
  bold: {
    label: "Bold",
    summary: "Large sans-serif headlines, solid module colours, rounder corners.",
    patch: {
      fonts: { display: "plex-sans", text: "plex-sans" },
      type: { headingScale: "large", bodyScale: "standard" },
      radius: 8,
      header: { layout: "split", sticky: true },
      footer: { layout: "columns", tagline: "" },
      heroStyle: "solid",
    },
  },
  minimal: {
    label: "Minimal",
    summary: "Compact type, centred header, compact footer, no tints.",
    patch: {
      fonts: { display: "plex-serif", text: "plex-sans" },
      type: { headingScale: "compact", bodyScale: "compact" },
      radius: 2,
      header: { layout: "centered", sticky: false },
      footer: { layout: "compact", tagline: "" },
      heroStyle: "plain",
    },
  },
};

export function applyTemplate(config: ThemeConfig, template: ThemeConfig["template"]): ThemeConfig {
  const { heroStyle, footer, ...rest } = TEMPLATE_PRESETS[template].patch;
  return {
    ...config,
    ...rest,
    template,
    footer: { layout: footer.layout, tagline: config.footer.tagline },
    modules: {
      poolx: { ...config.modules.poolx, heroStyle },
      auction: { ...config.modules.auction, heroStyle },
    },
  };
}

/** Parses untrusted stored data; falls back to the shipped design if anything is off. */
export function parseThemeConfig(value: unknown): ThemeConfig {
  const parsed = themeConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_THEME;
}
