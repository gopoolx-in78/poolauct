"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  BANNER_TONES,
  COLOR_SCHEMES,
  CONTRAST_PAIRS,
  DISPLAY_FONTS,
  FOOTER_LAYOUTS,
  HEADER_LAYOUTS,
  HERO_STYLES,
  PALETTE_KEYS,
  RADII,
  SCALES,
  TEMPLATE_PRESETS,
  TEMPLATES,
  TEXT_FONTS,
  applyTemplate,
  contrast,
  themeConfigSchema,
  type PaletteKey,
  type ThemeConfig,
} from "@/modules/theme/schema";
import { saveThemeDraftAction, type DraftState } from "../actions";
import { SECTION_LABEL, ThemePreview } from "./theme-preview";

const field = "border-rule bg-surface h-11 rounded border px-3";

const COLOR_LABEL: Record<PaletteKey, string> = {
  paper: "Page background",
  surface: "Cards and panels",
  secondary: "Secondary (footer, tints)",
  ink: "Text",
  inkMuted: "Secondary text",
  rule: "Borders and dividers",
  primary: "Primary (buttons)",
  primaryInk: "Text on primary",
  accent: "Accent (focus rings)",
  poolx: "PoolX colour",
  poolxInk: "Text on PoolX colour",
  auction: "Auction colour",
  auctionInk: "Text on auction colour",
};

const FONT_LABEL: Record<string, string> = {
  fraunces: "Fraunces (serif)",
  "plex-serif": "IBM Plex Serif",
  "plex-sans": "IBM Plex Sans",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="border-rule border-t pt-6">
      <legend className="font-display pr-2 text-2xl">{title}</legend>
      {hint ? <p className="text-ink-muted mt-1 text-sm">{hint}</p> : null}
      <div className="mt-4 grid gap-4">{children}</div>
    </fieldset>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={field}>
        {options.map((o) => (
          <option key={o} value={o}>
            {format ? format(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({
  label,
  value,
  onChange,
  max,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">
        {label} <span className="text-ink-muted font-normal">(plain text, up to {max})</span>
      </span>
      {multiline ? (
        <textarea
          value={value}
          maxLength={max}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="border-rule bg-surface rounded border px-3 py-2"
        />
      ) : (
        <input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={field} />
      )}
    </label>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="border-rule hover:bg-ink/5 inline-flex size-11 items-center justify-center rounded border disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

function LinkRows({
  links,
  onChange,
  max,
  what,
}: {
  links: ThemeConfig["nav"];
  onChange: (l: ThemeConfig["nav"]) => void;
  max: number;
  what: string;
}) {
  return (
    <div className="grid gap-3">
      {links.map((l, i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">
              {what} {i + 1} text
            </span>
            <input
              value={l.label}
              maxLength={30}
              onChange={(e) => onChange(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
              className={field}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">
              {what} {i + 1} path
            </span>
            <input
              value={l.href}
              maxLength={120}
              placeholder="/poolx"
              onChange={(e) => onChange(links.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)))}
              className={cn(field, "font-mono")}
            />
          </label>
          <div className="flex gap-1">
            <IconButton
              label={`Move ${what.toLowerCase()} ${i + 1} up`}
              disabled={i === 0}
              onClick={() => onChange(move(links, i, -1))}
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton
              label={`Move ${what.toLowerCase()} ${i + 1} down`}
              disabled={i === links.length - 1}
              onClick={() => onChange(move(links, i, 1))}
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton
              label={`Remove ${what.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(links.filter((_, k) => k !== i))}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        </div>
      ))}
      {links.length < max && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="justify-self-start"
          onClick={() => onChange([...links, { label: "New link", href: "/" }])}
        >
          <Plus aria-hidden="true" className="size-4" /> Add {what.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

export function ThemeEditor({
  initial,
  initialLabel,
  siteName,
  canPublish,
}: {
  initial: ThemeConfig;
  initialLabel: string;
  siteName: string;
  canPublish: boolean;
}) {
  const [config, setConfig] = useState<ThemeConfig>(initial);
  const [label, setLabel] = useState(initialLabel);
  const [state, formAction, pending] = useActionState<DraftState, FormData>(saveThemeDraftAction, {});
  const mutate = (f: (c: ThemeConfig) => void) =>
    setConfig((prev) => {
      const next = structuredClone(prev);
      f(next);
      return next;
    });

  const validation = useMemo(() => themeConfigSchema.safeParse(config), [config]);
  const issues = validation.success ? [] : validation.error.issues.map((i) => i.message);

  return (
    <div className="mt-6 grid gap-10 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <form action={formAction} className="grid gap-8">
        <input type="hidden" name="config" value={JSON.stringify(config)} />

        <Section
          title="Template"
          hint="A starting point for fonts, sizes, corners, header, footer and hero styles. Text, links and colours are kept."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={config.template === t}
                onClick={() => setConfig((c) => applyTemplate(c, t))}
                className={cn(
                  "border-rule rounded border p-4 text-left",
                  config.template === t && "border-ink ring-ink ring-1",
                )}
              >
                <span className="font-medium">{TEMPLATE_PRESETS[t].label}</span>
                <span className="text-ink-muted mt-1 block text-sm">{TEMPLATE_PRESETS[t].summary}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Colours"
          hint="Every text/background pair must stay readable (at least 4.5:1). Problems are listed below the palettes."
        >
          <Select
            label="Default colour mode for visitors"
            value={config.colorScheme}
            options={COLOR_SCHEMES}
            onChange={(v) => mutate((c) => void (c.colorScheme = v))}
            format={(v) => (v === "system" ? "Follow the visitor’s device" : v === "light" ? "Light" : "Dark")}
          />
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode}>
              <p className="font-medium">{mode === "light" ? "Light palette" : "Dark palette"}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PALETTE_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-3 text-sm">
                    <input
                      type="color"
                      value={config.colors[mode][k]}
                      onChange={(e) => mutate((c) => void (c.colors[mode][k] = e.target.value.toLowerCase()))}
                      className="border-rule h-11 w-14 shrink-0 cursor-pointer rounded border"
                      aria-label={`${mode === "light" ? "Light" : "Dark"} palette: ${COLOR_LABEL[k]}`}
                    />
                    <span>
                      {COLOR_LABEL[k]}
                      <span className="text-ink-muted block font-mono text-xs">{config.colors[mode][k]}</span>
                    </span>
                  </label>
                ))}
              </div>
              <ul className="mt-2 text-sm">
                {CONTRAST_PAIRS.map(([fg, bg, min]) => {
                  const r = contrast(config.colors[mode][fg], config.colors[mode][bg]);
                  return r < min ? (
                    <li key={`${fg}-${bg}`} className="text-danger">
                      {COLOR_LABEL[fg]} on {COLOR_LABEL[bg].toLowerCase()}: {r.toFixed(2)}:1 (needs {min}:1)
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ))}
        </Section>

        <Section title="Typography">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Headline font"
              value={config.fonts.display}
              options={DISPLAY_FONTS}
              onChange={(v) => mutate((c) => void (c.fonts.display = v))}
              format={(v) => FONT_LABEL[v] ?? v}
            />
            <Select
              label="Body font"
              value={config.fonts.text}
              options={TEXT_FONTS}
              onChange={(v) => mutate((c) => void (c.fonts.text = v))}
              format={(v) => FONT_LABEL[v] ?? v}
            />
            <Select
              label="Headline size"
              value={config.type.headingScale}
              options={SCALES}
              onChange={(v) => mutate((c) => void (c.type.headingScale = v))}
            />
            <Select
              label="Body text size"
              value={config.type.bodyScale}
              options={SCALES}
              onChange={(v) => mutate((c) => void (c.type.bodyScale = v))}
            />
            <Select
              label="Corner radius"
              value={String(config.radius)}
              options={RADII.map(String)}
              onChange={(v) => mutate((c) => void (c.radius = Number(v)))}
              format={(v) => `${v}px`}
            />
          </div>
        </Section>

        <Section
          title="Header and navigation"
          hint="Menu links must be internal paths such as /poolx or /how-it-works#auctions."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Header layout"
              value={config.header.layout}
              options={HEADER_LAYOUTS}
              onChange={(v) => mutate((c) => void (c.header.layout = v))}
            />
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={config.header.sticky}
                onChange={(e) => mutate((c) => void (c.header.sticky = e.target.checked))}
                className="size-5"
              />
              Keep the header visible while scrolling
            </label>
          </div>
          <LinkRows links={config.nav} max={8} what="Menu link" onChange={(nav) => mutate((c) => void (c.nav = nav))} />
        </Section>

        <Section title="Footer">
          <Select
            label="Footer layout"
            value={config.footer.layout}
            options={FOOTER_LAYOUTS}
            onChange={(v) => mutate((c) => void (c.footer.layout = v))}
          />
          <Text
            label="Tagline"
            value={config.footer.tagline}
            max={160}
            onChange={(v) => mutate((c) => void (c.footer.tagline = v))}
          />
          {config.footerGroups.map((g, gi) => (
            <div key={gi} className="border-rule grid gap-3 border-l-2 pl-4">
              <div className="flex items-end gap-2">
                <label className="grid flex-1 gap-1 text-sm">
                  <span className="font-medium">Footer group {gi + 1} title</span>
                  <input
                    value={g.title}
                    maxLength={30}
                    onChange={(e) => mutate((c) => void (c.footerGroups[gi]!.title = e.target.value))}
                    className={field}
                  />
                </label>
                <IconButton
                  label={`Remove footer group ${gi + 1}`}
                  onClick={() => mutate((c) => void c.footerGroups.splice(gi, 1))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </div>
              <LinkRows
                links={g.links}
                max={6}
                what={`Group ${gi + 1} link`}
                onChange={(links) => mutate((c) => void (c.footerGroups[gi]!.links = links))}
              />
            </div>
          ))}
          {config.footerGroups.length < 4 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                mutate((c) => void c.footerGroups.push({ title: "New group", links: [{ label: "Home", href: "/" }] }))
              }
            >
              <Plus aria-hidden="true" className="size-4" /> Add footer group
            </Button>
          )}
        </Section>

        <Section title="Homepage hero">
          <Text
            label="Eyebrow"
            value={config.hero.eyebrow}
            max={60}
            onChange={(v) => mutate((c) => void (c.hero.eyebrow = v))}
          />
          <Text
            label="Heading"
            value={config.hero.heading}
            max={120}
            onChange={(v) => mutate((c) => void (c.hero.heading = v))}
          />
          <Text
            label="Introduction"
            value={config.hero.subheading}
            max={300}
            multiline
            onChange={(v) => mutate((c) => void (c.hero.subheading = v))}
          />
        </Section>

        <Section
          title="Homepage sections"
          hint="Order and show or hide sections. The hero holds the page heading and always stays on."
        >
          <ol className="grid gap-2">
            {config.home.sections.map((s, i) => (
              <li key={s.type} className="border-rule flex items-center gap-2 rounded border p-2">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={s.type === "hero"}
                    onChange={(e) => mutate((c) => void (c.home.sections[i]!.enabled = e.target.checked))}
                    className="size-5"
                  />
                  {SECTION_LABEL[s.type]}
                </label>
                <IconButton
                  label={`Move ${SECTION_LABEL[s.type]} up`}
                  disabled={i === 0}
                  onClick={() => mutate((c) => void (c.home.sections = move(c.home.sections, i, -1)))}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </IconButton>
                <IconButton
                  label={`Move ${SECTION_LABEL[s.type]} down`}
                  disabled={i === config.home.sections.length - 1}
                  onClick={() => mutate((c) => void (c.home.sections = move(c.home.sections, i, 1)))}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          title="PoolX and Auction settings"
          hint="Module colours are in the palettes above. Hiding a module only hides its homepage card."
        >
          {(["poolx", "auction"] as const).map((m) => (
            <div key={m} className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={config.modules[m].visible}
                  onChange={(e) => mutate((c) => void (c.modules[m].visible = e.target.checked))}
                  className="size-5"
                />
                Show the {m === "poolx" ? "PoolX" : "Auctions"} card on the homepage
              </label>
              <Select
                label={`${m === "poolx" ? "PoolX" : "Auctions"} page hero style`}
                value={config.modules[m].heroStyle}
                options={HERO_STYLES}
                onChange={(v) => mutate((c) => void (c.modules[m].heroStyle = v))}
              />
            </div>
          ))}
        </Section>

        <Section
          title="Banners"
          hint="Up to three site-wide announcements. Plain text, with an optional internal link."
        >
          {config.banners.map((b, i) => (
            <div key={b.id} className="border-rule grid gap-3 border-l-2 pl-4">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={b.enabled}
                    onChange={(e) => mutate((c) => void (c.banners[i]!.enabled = e.target.checked))}
                    className="size-5"
                  />
                  Show banner {i + 1}
                </label>
                <IconButton label={`Remove banner ${i + 1}`} onClick={() => mutate((c) => void c.banners.splice(i, 1))}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </div>
              <Text
                label={`Banner ${i + 1} message`}
                value={b.message}
                max={160}
                onChange={(v) => mutate((c) => void (c.banners[i]!.message = v))}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Text
                  label="Link text"
                  value={b.linkLabel}
                  max={40}
                  onChange={(v) => mutate((c) => void (c.banners[i]!.linkLabel = v))}
                />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Link path (optional)</span>
                  <input
                    value={b.href ?? ""}
                    maxLength={120}
                    placeholder="/auctions"
                    onChange={(e) =>
                      mutate((c) => void (c.banners[i]!.href = e.target.value === "" ? null : e.target.value))
                    }
                    className={cn(field, "font-mono")}
                  />
                </label>
                <Select
                  label="Tone"
                  value={b.tone}
                  options={BANNER_TONES}
                  onChange={(v) => mutate((c) => void (c.banners[i]!.tone = v))}
                />
              </div>
            </div>
          ))}
          {config.banners.length < 3 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                mutate((c) => {
                  let n = 1;
                  while (c.banners.some((b) => b.id === `banner-${n}`)) n++;
                  c.banners.push({
                    id: `banner-${n}`,
                    message: "New announcement",
                    linkLabel: "",
                    href: null,
                    tone: "info",
                    enabled: false,
                  });
                })
              }
            >
              <Plus aria-hidden="true" className="size-4" /> Add banner
            </Button>
          )}
        </Section>

        <div className="border-rule bg-paper sticky bottom-0 grid gap-3 border-t py-4">
          {issues.length > 0 && (
            <div role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
              <p className="font-medium">Fix these before saving:</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.slice(0, 8).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {state.error && (
            <div role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
              <p>{state.error}</p>
              {state.issues?.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {state.issues.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {state.savedAt && !state.error && (
            <p role="status" className="border-success bg-success/5 border-l-4 px-4 py-3 text-sm">
              Draft saved.{" "}
              <Link href="/admin/theme" className="underline underline-offset-4">
                {canPublish ? "Review and publish it" : "Back to the theme overview"}
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Version name</span>
              <input
                name="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                minLength={3}
                maxLength={80}
                className={cn(field, "w-72")}
              />
            </label>
            <Button type="submit" disabled={pending || issues.length > 0}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfig(initial)}>
              Undo unsaved changes
            </Button>
          </div>
        </div>
      </form>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <ThemePreview config={config} siteName={siteName} />
      </aside>
    </div>
  );
}
