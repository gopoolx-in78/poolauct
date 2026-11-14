"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { paletteVars, shapeVars } from "@/modules/theme/compile";
import type { HomeSection, ThemeConfig } from "@/modules/theme/schema";

const SECTION_LABEL: Record<HomeSection, string> = {
  hero: "Hero (page heading)",
  marketplaces: "Marketplace cards",
  principles: "Why two marketplaces",
  how: "How it works",
  faq: "FAQ highlights",
  blog: "Latest blog posts",
};

const TONE: Record<ThemeConfig["banners"][number]["tone"], string> = {
  info: "border-info bg-info/10",
  success: "border-success bg-success/10",
  warning: "border-warning bg-warning/10",
};

/**
 * Live preview: the draft's tokens are applied as CSS variables on this subtree only, so it renders with the same
 * utilities as the public site without touching the admin's fixed styling.
 */
export function ThemePreview({ config, siteName }: { config: ThemeConfig; siteName: string }) {
  const [mode, setMode] = useState<"light" | "dark">(config.colorScheme === "dark" ? "dark" : "light");
  const style = {
    ...paletteVars(config.colors[mode]),
    ...shapeVars(config),
    "--color-accent": "var(--color-ink)",
    "--color-accent-ink": "var(--color-paper)",
    colorScheme: mode,
    fontFamily: "var(--theme-font-text)",
  } as CSSProperties;
  const nav = config.nav.map((l) => (
    <span key={`${l.href}|${l.label}`} className="text-ink-muted px-2 text-sm">
      {l.label}
    </span>
  ));
  const logo = <span className="font-display text-lg font-semibold">{siteName}</span>;
  const sections = config.home.sections.filter((s) => s.enabled);
  const modules = (["poolx", "auction"] as const).filter((m) => config.modules[m].visible);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl">Live preview</h2>
        <div role="group" aria-label="Preview colour mode" className="flex gap-1">
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("border-rule h-9 rounded border px-3 text-sm", mode === m && "bg-ink text-paper")}
            >
              {m === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
      <div
        role="region"
        aria-label={`Preview of the draft design (${mode})`}
        style={style}
        className="border-rule bg-paper text-ink mt-3 overflow-hidden rounded border"
      >
        {/* Header */}
        <div className="border-rule bg-paper border-b px-4">
          {config.header.layout === "centered" ? (
            <div className="py-3 text-center">
              {logo}
              <div className="mt-1 flex flex-wrap justify-center">{nav}</div>
            </div>
          ) : config.header.layout === "split" ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center py-3">
              <div className="flex flex-wrap">{nav}</div>
              {logo}
              <span />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              {logo}
              <div className="flex flex-wrap">{nav}</div>
            </div>
          )}
          <p className="text-ink-muted pb-1 text-[0.65rem]">
            {config.header.sticky ? "Sticky header" : "Header scrolls away"}
          </p>
        </div>
        {/* Banners */}
        {config.banners
          .filter((b) => b.enabled)
          .map((b) => (
            <div key={b.id} className={cn("border-b border-l-4 px-4 py-2 text-xs", TONE[b.tone])}>
              {b.message} {b.href ? <span className="font-medium underline">{b.linkLabel}</span> : null}
            </div>
          ))}
        {/* Hero */}
        <div className="border-rule border-b px-4 py-6">
          {config.hero.eyebrow && (
            <p className="text-ink-muted font-mono text-[0.65rem] tracking-[0.2em] uppercase">{config.hero.eyebrow}</p>
          )}
          <p className="font-display mt-2 text-3xl leading-tight">{config.hero.heading}</p>
          {config.hero.subheading && <p className="text-ink-muted mt-2 text-sm">{config.hero.subheading}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="bg-brand text-brand-ink inline-flex h-9 items-center rounded px-3 text-sm font-medium">
              Primary button
            </span>
            <span className="border-ink inline-flex h-9 items-center rounded border px-3 text-sm font-medium">
              Secondary
            </span>
            <span className="bg-surface border-rule inline-flex h-9 items-center rounded border px-3 text-sm">
              Card surface
            </span>
          </div>
        </div>
        {/* Modules */}
        {modules.length > 0 && (
          <div className={cn("bg-rule grid gap-px", modules.length > 1 && "sm:grid-cols-2")}>
            {modules.map((m) => (
              <div key={m} data-module={m} className="bg-paper">
                <div data-hero={config.modules[m].heroStyle} className="px-4 py-4">
                  <div data-hero-text>
                    <p className="text-accent font-mono text-[0.65rem] tracking-[0.2em] uppercase">
                      {m === "poolx" ? "PoolX · Group buying" : "Auctions · Second-hand assets"}
                    </p>
                    <p className="font-display mt-1 text-2xl">
                      {m === "poolx" ? "Power of Pooling." : "Discover it. Bid on it."}
                    </p>
                    <span className="bg-accent text-accent-ink mt-3 inline-flex h-9 items-center rounded px-3 text-sm font-medium">
                      {m === "poolx" ? "Browse pools" : "See live auctions"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Section order */}
        <div className="px-4 py-4">
          <p className="text-ink-muted text-xs uppercase">Homepage sections</p>
          <ol className="mt-1 list-decimal pl-5 text-sm">
            {sections.map((s) => (
              <li key={s.type}>{SECTION_LABEL[s.type]}</li>
            ))}
          </ol>
        </div>
        {/* Footer */}
        <div className="border-ink bg-secondary border-t px-4 py-4 text-sm">
          {config.footer.layout === "compact" ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-display font-semibold">{siteName}</span>
              {config.footerGroups
                .flatMap((g) => g.links)
                .map((l) => (
                  <span key={`${l.href}|${l.label}`}>{l.label}</span>
                ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="font-display font-semibold">{siteName}</p>
                {config.footer.tagline && <p className="text-ink-muted mt-1 text-xs">{config.footer.tagline}</p>}
              </div>
              {config.footerGroups.map((g) => (
                <div key={g.title}>
                  <p className="text-ink-muted font-mono text-[0.65rem] uppercase">{g.title}</p>
                  {g.links.map((l) => (
                    <p key={`${l.href}|${l.label}`}>{l.label}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { SECTION_LABEL };
