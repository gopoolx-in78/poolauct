# Design System

> Status: **proposed** tokens (Phase 0). Implemented in Phase 1 as CSS variables in `src/app/globals.css`
> and Tailwind theme extensions. All public tokens are overridable through the theme manager
> (allowlisted keys only). Admin UI uses a fixed token set. Last updated: 2026-11-13.

## Direction
**Editorial / modern marketplace** — a financial-magazine feel: big typographic headlines, a tight 12-column grid,
hairline dividers, sharp-ish corners, near-black on warm off-white, one bold accent per module, minimal shadow,
numbers set in tabular mono. Real product photography carries colour. No gradient blobs, no glassmorphism,
not "indigo everywhere".

## Colour tokens (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-paper` | `#F7F5F0` | `#0E0E0C` | page background |
| `--color-surface` | `#FFFFFF` | `#181816` | cards, panels |
| `--color-ink` | `#141412` | `#F2F0EA` | primary text |
| `--color-ink-muted` | `#55534D` | `#A8A59C` | secondary text (≥ 4.5:1 on paper) |
| `--color-rule` | `#D9D5CC` | `#2C2B27` | hairline dividers, borders |
| `--color-brand` | `#141412` | `#F2F0EA` | parent brand (ink-as-brand) |
| `--color-poolx` | `#0B7A57` | `#3DDC97` | PoolX accent (progress, CTAs) |
| `--color-poolx-ink` | `#FFFFFF` | `#06281C` | text on PoolX accent |
| `--color-auction` | `#C2410C` | `#FF8A4C` | Auction accent (live, bid CTAs) |
| `--color-auction-ink` | `#FFFFFF` | `#2A0E02` | text on Auction accent |
| `--color-success` | `#16794C` | `#4ADE80` | |
| `--color-warning` | `#A15C00` | `#FBBF24` | |
| `--color-danger` | `#B42318` | `#F87171` | |
| `--color-info` | `#1F5FAD` | `#7CB4FF` | |
| `--color-focus` | `#1F5FAD` | `#7CB4FF` | 2px focus ring + 2px offset |

Module scoping: `[data-module="poolx"]` / `[data-module="auction"]` set `--color-accent` to the module colour so shared
components (Button, Progress, Badge) pick the right accent automatically. All pairs verified ≥ 4.5:1 (text) / 3:1 (UI) in Phase 1.

## Typography
| Role | Family (proposed, self-hosted via `next/font`) | Fallback |
|---|---|---|
| Display | **Fraunces** (variable, opsz) | Georgia, serif |
| Text / UI | **IBM Plex Sans** | system-ui, sans-serif |
| Numerals / prices / timers | **IBM Plex Mono** (`tabular-nums`) | ui-monospace |

Scale (fluid `clamp`, 1.25 ratio): `xs 12` · `sm 14` · `base 16` · `lg 20` · `xl 25` · `2xl 31` · `3xl 39` · `4xl 49` · `5xl 61` · `display 76–96`.
Line-height: text 1.5, headings 1.1. One H1 per page.

## Spacing / layout
8px grid: `0, 4, 8, 16, 24, 32, 48, 64, 96, 128`. Container max 1280px, 16px gutter on mobile, 24px tablet, 32px desktop.
Breakpoints: `xs 320`, `sm 375`, `md 480`, `lg 768`, `xl 1024`, `2xl 1440`.

## Shape & depth
Single radius `--radius: 4px` (pills only for status badges: `999px`). Shadows: `none` by default; `--shadow-raise: 0 1px 0 var(--color-rule)`;
overlays `0 8px 24px rgb(0 0 0 / .12)`.

## Motion
Durations `120ms` (micro), `200ms` (UI), `400ms` (reveal), easing `cubic-bezier(.2,.7,.2,1)`. Signature: pool card progress fill +
price "step-down" ticker; live bid "flash" on new highest bid. Everything disabled/instant under `prefers-reduced-motion: reduce`.

## Components (Phase 1 primitives)
Button (primary/secondary/ghost/danger; loading & disabled), Link, Input, Select, Textarea, Checkbox, Radio, Switch, FormField (label, hint, error),
Card, Badge/StatusPill, Progress (bar + ring), Countdown (display-only), Price (INR formatter, strike-through reference), Tabs, Dialog (focus trap),
Drawer (mobile nav), Toast, Table (responsive, caption, sortable headers), Pagination, EmptyState, Skeleton, Breadcrumbs, Stat, Alert, Stepper.

## Theme-manager allowlist (implemented, Phase 7 — `src/modules/theme/schema.ts`, `cms.theme_config_problem`)
- **Template:** `editorial | bold | minimal` (sets fonts, scales, radius, header / footer layout, hero styles; keeps text, links, colours).
- **Default colour scheme:** `system | light | dark`.
- **Palettes (light and dark, lowercase `#rrggbb`):** paper, surface, secondary, ink, inkMuted, rule, primary, primaryInk,
  accent, poolx, poolxInk, auction, auctionInk — contrast ≥ 4.5 for ink / inkMuted on paper, surface, secondary;
  primaryInk on primary; accent on paper; module ink on module colour; module colour on paper and surface.
- **Fonts:** display `fraunces | plex-serif | plex-sans`; text `plex-sans | plex-serif` (all self-hosted via `next/font`).
- **Type scales:** heading and body `compact | standard | large`. **Radius:** 0, 2, 4, 6, 8 or 12 px.
- **Header:** `classic | centered | split`, sticky on/off. **Footer:** `columns | compact`, tagline ≤ 160.
- **Menu:** 1–8 internal links. **Footer groups:** ≤ 4 groups of 1–6 internal links.
- **Hero:** eyebrow ≤ 60, heading 1–120, subheading ≤ 300 (plain text).
- **Modules:** PoolX / Auctions visible on the homepage, hero style `plain | tinted | solid`.
- **Homepage sections:** hero, marketplaces, principles, how, faq, blog — each once, any order, hero always on.
- **Banners:** ≤ 3, message, optional link label + internal link, tone `info | success | warning`, on/off.
Values compile to custom properties (`--color-*`, `--theme-font-display|text`, `--heading-scale`, `--body-scale`, `--radius`)
in `:root:root` blocks for light, dark-by-preference and forced dark. Admin re-declares the shipped values under `[data-admin]`.
