import { describe, expect, it } from "vitest";
import { ADMIN_THEME_CSS, compileThemeCss } from "@/modules/theme/compile";
import {
  applyTemplate,
  contrast,
  DEFAULT_THEME,
  parseThemeConfig,
  themeConfigSchema,
  type ThemeConfig,
} from "@/modules/theme/schema";

const clone = (): ThemeConfig => structuredClone(DEFAULT_THEME);
const firstError = (value: unknown) => {
  const r = themeConfigSchema.safeParse(value);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("theme schema (allowlist)", () => {
  it("accepts the shipped design", () => {
    expect(themeConfigSchema.safeParse(DEFAULT_THEME).success).toBe(true);
  });

  it("rejects unknown keys such as a deposit switch", () => {
    expect(themeConfigSchema.safeParse({ ...clone(), deposit: { enabled: false } }).success).toBe(false);
    const c = clone() as unknown as { colors: { light: Record<string, string> } };
    c.colors.light.background = "#ffffff";
    expect(themeConfigSchema.safeParse(c).success).toBe(false);
  });

  it("rejects CSS injection and non-hex colours", () => {
    const c = clone();
    c.colors.light.paper = "red;} body{display:none";
    expect(firstError(c)).toMatch(/#rrggbb/);
    c.colors.light.paper = "#F7F5F0";
    expect(firstError(c)).toMatch(/#rrggbb/);
  });

  it("allows only internal links", () => {
    for (const href of ["javascript:alert(1)", "//evil.example", "https://evil.example", "/a b", "/Poolx", "/x?y=1"]) {
      const c = clone();
      c.nav[0]!.href = href;
      expect(themeConfigSchema.safeParse(c).success, href).toBe(false);
    }
    const ok = clone();
    ok.nav[0]!.href = "/how-it-works#auctions";
    expect(themeConfigSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects markup in text fields", () => {
    const c = clone();
    c.hero.heading = "<script>alert(1)</script>";
    expect(themeConfigSchema.safeParse(c).success).toBe(false);
  });

  it("enforces readable contrast", () => {
    const c = clone();
    c.colors.dark.ink = c.colors.dark.paper;
    expect(firstError(c)).toMatch(/Contrast too low in the dark palette: ink on paper/);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("keeps the hero section enabled and sections unique", () => {
    const c = clone();
    c.home.sections[0]!.enabled = false;
    expect(themeConfigSchema.safeParse(c).success).toBe(false);
    const d = clone();
    d.home.sections[1] = { type: "hero", enabled: true };
    expect(themeConfigSchema.safeParse(d).success).toBe(false);
  });

  it("falls back to the shipped design for invalid stored data", () => {
    expect(parseThemeConfig({ schema: 1 })).toEqual(DEFAULT_THEME);
    expect(parseThemeConfig(null)).toEqual(DEFAULT_THEME);
  });

  it("templates change design settings only", () => {
    const c = clone();
    c.hero.heading = "Custom heading";
    const bold = applyTemplate(c, "bold");
    expect(bold.template).toBe("bold");
    expect(bold.radius).toBe(8);
    expect(bold.modules.poolx.heroStyle).toBe("solid");
    expect(bold.hero.heading).toBe("Custom heading");
    expect(bold.colors).toEqual(c.colors);
    expect(bold.nav).toEqual(c.nav);
    expect(themeConfigSchema.safeParse(bold).success).toBe(true);
  });
});

describe("theme compiler", () => {
  it("emits only allowlisted custom properties", () => {
    const css = compileThemeCss(DEFAULT_THEME);
    const props = new Set([...css.matchAll(/(--[a-z-]+|color-scheme):/g)].map((m) => m[1]));
    for (const p of props) {
      expect(p).toMatch(
        /^(color-scheme|--color-[a-z-]+|--theme-font-(display|text)|--heading-scale|--body-scale|--radius)$/,
      );
    }
    expect(css).toContain("--color-paper:#f7f5f0");
    expect(css).toContain(':root:root[data-theme="dark"]');
    expect(css).not.toMatch(/[<\\]/);
  });

  it("refuses invalid input instead of emitting it", () => {
    const c = clone();
    c.colors.light.ink = "#000;}</style><script>";
    expect(() => compileThemeCss(c)).toThrow();
  });

  it("scopes the fixed admin token set", () => {
    expect(ADMIN_THEME_CSS.startsWith("[data-admin]{")).toBe(true);
    expect(ADMIN_THEME_CSS).toContain(':root[data-theme="dark"] [data-admin]');
  });
});
