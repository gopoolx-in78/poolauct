import {
  DEFAULT_THEME,
  PALETTE_KEYS,
  themeConfigSchema,
  type Palette,
  type PaletteKey,
  type ThemeConfig,
} from "./schema";

/**
 * Theme compiler: validated design document → CSS custom properties. Only the allowlisted tokens below are ever
 * emitted, and every value is re-validated, so a document can never inject arbitrary CSS. Client-safe (used by the
 * editor's live preview).
 */

const COLOR_VARS: Record<PaletteKey, string> = {
  paper: "--color-paper",
  surface: "--color-surface",
  secondary: "--color-secondary",
  ink: "--color-ink",
  inkMuted: "--color-ink-muted",
  rule: "--color-rule",
  primary: "--color-brand",
  primaryInk: "--color-brand-ink",
  accent: "--color-focus",
  poolx: "--color-poolx",
  poolxInk: "--color-poolx-ink",
  auction: "--color-auction",
  auctionInk: "--color-auction-ink",
};

const FONT_STACKS: Record<ThemeConfig["fonts"]["display"] | ThemeConfig["fonts"]["text"], string> = {
  fraunces: "var(--font-fraunces), Georgia, serif",
  "plex-serif": "var(--font-plex-serif), Georgia, serif",
  "plex-sans": "var(--font-plex-sans), system-ui, sans-serif",
};

const HEADING_SCALE = { compact: "0.9", standard: "1", large: "1.12" } as const;
const BODY_SCALE = { compact: "0.9375", standard: "1", large: "1.0625" } as const;

export function paletteVars(p: Palette): Record<string, string> {
  return Object.fromEntries(PALETTE_KEYS.map((k) => [COLOR_VARS[k], p[k]]));
}

/** Non-colour tokens. */
export function shapeVars(c: ThemeConfig): Record<string, string> {
  return {
    "--theme-font-display": FONT_STACKS[c.fonts.display],
    "--theme-font-text": FONT_STACKS[c.fonts.text],
    "--heading-scale": HEADING_SCALE[c.type.headingScale],
    "--body-scale": BODY_SCALE[c.type.bodyScale],
    "--radius": `${c.radius}px`,
  };
}

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

/**
 * CSS for a theme. `scope` null → the public site (`:root`, doubled for specificity over globals.css);
 * a scope such as `[data-admin]` pins a fixed token set to that subtree (TD-13).
 */
export function compileThemeCss(input: ThemeConfig, scope: string | null = null): string {
  const c = themeConfigSchema.parse(input); // throws on anything outside the allowlist
  const base = scope ?? ":root:root";
  const darkMedia = scope ? `:root:not([data-theme="light"]) ${scope}` : `:root:root:not([data-theme="light"])`;
  const darkForced = scope ? `:root[data-theme="dark"] ${scope}` : `:root:root[data-theme="dark"]`;
  const css = [
    block(base, {
      "color-scheme": "light",
      ...paletteVars(c.colors.light),
      ...shapeVars(c),
      // Re-derive the module-neutral accent inside a scope (computed values would otherwise be inherited from :root).
      "--color-accent": "var(--color-ink)",
      "--color-accent-ink": "var(--color-paper)",
    }),
    `@media (prefers-color-scheme: dark){${block(darkMedia, { "color-scheme": "dark", ...paletteVars(c.colors.dark) })}}`,
    block(darkForced, { "color-scheme": "dark", ...paletteVars(c.colors.dark) }),
  ].join("\n");
  // Defence in depth: the output is inlined in a <style> element, so it must never contain markup or escapes.
  if (/[<\\]/.test(css)) throw new Error("Theme compiler produced unexpected characters");
  return css;
}

/** The fixed admin token set: the shipped design, never the published theme. */
export const ADMIN_THEME_CSS = compileThemeCss(DEFAULT_THEME, "[data-admin]");
