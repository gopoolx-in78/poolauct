# PoolX — Build Prompt (New Approach)

> A ready-to-paste prompt for an AI builder (Claude / v0 / Lovable / Cursor) to rebuild
> the PoolX marketing + pools site in a fresh, more modern direction.

---

## Part A — What the current site is (analysis)

**Product:** PoolX — a community group-buying ("pooling") platform. People join buying
pools to combine demand and unlock wholesale/bulk pricing (15–40% off) on electronics,
groceries, construction materials, society purchases, office supplies and services.
Money is held in escrow; PoolX negotiates with verified sellers; goods ship individually.

**Current stack:** React 19 + React Router 7, Vite, TypeScript, Tailwind (via CDN),
`lucide-react` icons, Inter font. Pools persist in `localStorage`; there's an Admin page
and a Firebase lib stub. No backend wired up.

**Pages:** Home, About, How It Works, Use Cases, Pools, Trust & Security, Contact,
Coming Soon, Admin, Privacy, Terms.

**Current design language (what to evolve away from):**
- Heavy indigo (`indigo-600` / `indigo-950`) + emerald accents, everything in light mode.
- Rounded-everything (`rounded-2xl`/`3xl`), soft shadows, blurry blobs, glass navbar.
- Generic SaaS layout: centered hero + phone mockup, 4-card problem grid, dark solution
  band, 5-step timeline. Competent but interchangeable — looks like a 2021 fintech template.

---

## Part B — The build prompt (the "new way")

Paste everything below into your AI builder.

---

**Build a marketing + product website for "PoolX", a community group-buying platform where
people pool demand to unlock wholesale pricing.** Rebuild it with a distinctive, modern
visual identity — do NOT produce a generic indigo SaaS template.

### Positioning / voice
- Tagline: **"Power of People. Power of Pooling."**
- One-liner: Join buying pools, combine purchasing power, get corporate-level prices on
  everything from phones to cement. Money sits in escrow until the deal locks.
- Tone: confident, plain-spoken, a little rebellious ("negotiate like a corporation").
  Numbers-forward, not buzzwordy.

### New design direction (this is the point)
Pick ONE of these and commit to it fully — pitch me the choice in a sentence first:
1. **Editorial / brutalist-fintech** — big typographic headlines, sharp corners, a tight
   grid, one bold accent color on near-black or off-white, hairline dividers, minimal
   shadow. Think a financial magazine, not a SaaS landing page.
2. **Tactile / depth** — soft neumorphic cards, real product photography, subtle grain,
   warm neutral palette with a single vivid accent.
3. **Data-native dark** — dark canvas, neon-accent progress rings and live counters, mono
   numerals, dashboard energy that makes "pooling" feel like a live market.

Hard rules regardless of choice:
- **No blurry gradient blobs, no glassmorphism navbar, no "indigo-600 everywhere."**
- Define a real **design system first**: a 4–6 token color palette, a type scale with a
  genuine display face paired with a clean text face (not Inter-only), an 8px spacing grid,
  one consistent corner radius, and a documented motion language.
- Full **light + dark mode** driven by CSS variables.
- Accessible: WCAG AA contrast, visible focus states, reduced-motion support, semantic HTML.

### Signature interaction (make the product tangible)
The hero should feel *alive*, not a static mockup:
- A **live-feeling pool card**: an animated progress ring/bar filling toward its target,
  a member counter that ticks up, and a "price drops as more join" visual — show the unit
  price stepping down at member milestones (e.g. 20 → 10% off, 40 → 15% off). This "demand
  curve → discount" mechanic is the core idea; make it the thing people remember.

### Pages & content
- **Home:** hero with the live pool card; "buying alone is expensive" problem framing
  (4 points: high retail prices, bulk access reserved for corporations, risky informal
  groups, no trust); solution band (verified pools, escrow, pro negotiation, transparent
  rules); 5-step flow; closing CTA ("early users get 0% convenience fees for life").
- **How It Works:** 5 steps — Discover & Join → Secure Contribution (escrow) → Power
  Negotiation → Deal Locked (15–40% off) → Direct Delivery. Use a scroll-driven reveal,
  but lighter than a full alternating timeline.
- **Pools:** searchable grid of active pools. Each card: product, category, discount,
  progress bar, members (e.g. 42/50), status (active / locked / closed), a **Join** button
  with optimistic count update, and WhatsApp + Instagram share buttons. Seed with a couple
  of demo pools (iPhone 15 Pro Max, MacBook Air M3). Persist joins in `localStorage`.
- **Use Cases:** electronics, groceries, construction materials, society purchases, office
  supplies, service pooling — card grid, plus a "custom private pools for businesses &
  societies" CTA.
- **Trust & Security, About, Contact, Coming Soon / Early Access, Privacy, Terms.**
- **Admin (hidden):** CRUD for pools (name, category, discount, target members, unit price,
  platform fee %, seller, deadline, status) stored in `localStorage`.

### Data model (keep this)
```ts
type PoolStatus = 'pending' | 'active' | 'locked' | 'completed' | 'cancelled';
interface Pool {
  id: string; name: string; category: string; discount: string;
  progress: number; currentMembers: number; targetMembers: number;
  iconType: 'smartphone'|'laptop'|'shoppingbag'|'zap'|'home'|'package';
  whatsappLink: string; instagramLink: string;
  status: PoolStatus; seller?: string; unitPrice?: number;
  platformFeePercent?: number; deadline?: string; description?: string;
}
```

### Tech
- React + TypeScript + Vite, React Router.
- **Tailwind configured properly via a config file (not the CDN script)**, with the design
  tokens as theme extensions + CSS variables for theming.
- Keep `localStorage` persistence; leave a clean seam (a typed data layer) so a real
  backend (Firebase/Supabase) can drop in later.
- Component-driven, responsive mobile-first, no layout shift, good Lighthouse scores.

### Deliverables
1. One sentence on which design direction you chose and why.
2. The design-system tokens (colors, type, spacing, radius, motion).
3. The full site, all pages above, light + dark mode, the live hero interaction working.

Make it look like a product someone screenshots and shares — not a template.

---

*Analysis based on the existing `poolx78-main` React/Vite codebase.*
