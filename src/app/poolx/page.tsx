import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MemberProgress, PoolCard, PoolPrice } from "@/components/poolx/pool-card";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, Container, EmptyState, Progress, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { applyBps, formatINR, rupees, subPaise } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { formatIST, requestNow, timeLeft } from "@/lib/time";
import { getPublicStats, listCategories, listPools } from "@/modules/poolx/server/queries";

export const metadata = pageMetadata({
  title: "PoolX — Join buying pools and unlock bulk prices together",
  description:
    "PoolX lets people, businesses and housing societies combine their purchasing demand so pools can unlock quantity-based discount tiers from verified sellers.",
  path: "/poolx",
});

const steps = [
  [
    "Discover & join",
    "Find a pool for something you need, choose your quantity and read the pool’s rules before joining.",
  ],
  [
    "Secure contribution",
    "Pay your contribution through our payment partner. It counts only once the payment is confirmed to our servers.",
  ],
  [
    "Negotiation",
    "As membership grows, the pool unlocks better price tiers and the deal is confirmed with a verified seller.",
  ],
  ["Deal locked", "When the pool’s conditions are met, the price is locked and individual orders are created."],
  ["Direct delivery", "Each member’s order is delivered individually, with tracking where the seller supports it."],
] as const;

export default function PoolXPage() {
  return (
    <div data-module="poolx">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
          ]}
        />
      </Container>

      <section aria-labelledby="poolx-hero" className="border-rule border-b">
        <Container className="grid gap-12 py-12 md:py-20 lg:grid-cols-[3fr_2fr] lg:items-end">
          <div>
            <p className="text-accent font-mono text-xs tracking-[0.2em] uppercase">PoolX · Group buying</p>
            <h1 id="poolx-hero" className="mt-4 text-5xl md:text-7xl">
              Power of People.
              <br />
              Power of Pooling.
            </h1>
            <p className="text-ink-muted mt-6 max-w-xl text-lg md:text-xl">
              Join buying pools, combine purchasing power and negotiate like a corporation — whether you need one phone
              or a truckload of cement.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/poolx/pools" variant="accent" size="lg">
                Browse open pools
              </ButtonLink>
              <ButtonLink href="/poolx/request" variant="secondary" size="lg">
                Request a pool
              </ButtonLink>
            </div>
            <Suspense fallback={<Skeleton className="mt-8 h-6 w-64" />}>
              <Stats />
            </Suspense>
          </div>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <HeroCard />
          </Suspense>
        </Container>
      </section>

      <section aria-labelledby="pools-title" className="mt-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Ending soon" title="Open pools" id="pools-title" />
            <Link href="/poolx/pools" className="font-medium underline underline-offset-4">
              See all pools
            </Link>
          </div>
          <Suspense fallback={<Skeleton className="mt-8 h-80" />}>
            <FeaturedPools />
          </Suspense>
        </Container>
      </section>

      <section aria-labelledby="poolx-how" className="mt-20">
        <Container>
          <SectionHeading eyebrow="How PoolX works" title="Five steps from demand to delivery" id="poolx-how" />
          <ol className="bg-rule mt-10 grid gap-px md:grid-cols-5">
            {steps.map(([title, body], i) => (
              <li key={title} className="bg-paper p-5">
                <span className="text-accent font-mono text-sm">0{i + 1}</span>
                <h3 className="mt-3 text-xl">{title}</h3>
                <p className="text-ink-muted mt-2 text-sm">{body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="poolx-cats" className="mt-20">
        <Container>
          <SectionHeading eyebrow="What people pool" title="Categories" id="poolx-cats">
            From everyday electronics to building materials and housing-society purchases.
          </SectionHeading>
          <Suspense fallback={<Skeleton className="mt-8 h-24" />}>
            <Categories />
          </Suspense>
        </Container>
      </section>
    </div>
  );
}

async function Stats() {
  await connection();
  const stats = await getPublicStats();
  if (stats.openPools === 0) return null;
  return (
    <p className="mt-8 text-sm">
      <strong className="font-mono">{stats.openPools}</strong> open pool{stats.openPools === 1 ? "" : "s"} ·{" "}
      <strong className="font-mono">{stats.activeMembers}</strong> confirmed member
      {stats.activeMembers === 1 ? "" : "s"} right now
    </p>
  );
}

/** Live pool card from real data; falls back to a clearly labelled illustration when no pool is open. */
async function HeroCard() {
  const now = await requestNow();
  const { items } = await listPools({ sort: "popular", limit: 1 });
  const pool = items.find((p) => p.status === "ACTIVE");
  if (!pool) return <IllustrationCard />;
  return (
    <figure className="border-ink bg-surface border p-5" aria-labelledby="live-pool-caption">
      <figcaption id="live-pool-caption" className="flex items-center justify-between gap-2">
        <span className="text-accent font-mono text-xs tracking-[0.15em] uppercase">Live pool</span>
        <span className="text-ink-muted text-xs">{timeLeft(pool.deadlineAt, now)}</span>
      </figcaption>
      <p className="font-display mt-3 text-2xl">
        <Link href={`/poolx/pools/${pool.slug}`} className="hover:underline hover:underline-offset-4">
          {pool.title}
        </Link>
      </p>
      <div className="mt-4">
        <PoolPrice pool={pool} size="lg" />
      </div>
      <div className="mt-5">
        <MemberProgress pool={pool} />
      </div>
      <p className="text-ink-muted mt-4 text-xs">Deadline {formatIST(pool.deadlineAt)}</p>
      <ButtonLink href={`/poolx/pools/${pool.slug}`} variant="accent" className="mt-5 w-full">
        Join pool
      </ButtonLink>
    </figure>
  );
}

function IllustrationCard() {
  const base = rupees(1000);
  const tiers = [
    { members: 10, bps: 500 },
    { members: 20, bps: 1000 },
    { members: 40, bps: 1500 },
    { members: 50, bps: 2000 },
  ];
  return (
    <figure className="border-ink bg-surface border p-5" aria-labelledby="tier-caption">
      <figcaption id="tier-caption" className="flex items-center justify-between gap-2">
        <span className="font-display text-lg">How price tiers work</span>
        <span className="border-warning text-warning rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase">
          Illustration
        </span>
      </figcaption>
      <p className="text-ink-muted mt-1 text-sm">
        Example only — not a live pool. Each real pool publishes its own tiers.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <caption className="sr-only">Example discount tiers for an item with a reference price of ₹1,000</caption>
        <thead className="text-ink-muted font-mono text-xs tracking-wide uppercase">
          <tr>
            <th scope="col" className="py-2 font-normal">
              Members
            </th>
            <th scope="col" className="py-2 font-normal">
              Discount
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Unit price
            </th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {tiers.map((t) => (
            <tr key={t.members} className="border-rule border-t">
              <td className="py-2">{t.members}+</td>
              <td className="py-2">{t.bps / 100}%</td>
              <td className="py-2 text-right">{formatINR(subPaise(base, applyBps(base, t.bps)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Progress className="mt-4" value={2} max={4} label="Example: two of four tiers unlocked" />
    </figure>
  );
}

async function FeaturedPools() {
  const now = await requestNow();
  const { items } = await listPools({ sort: "ending", limit: 3 });
  if (items.length === 0) {
    return (
      <EmptyState className="mt-8" title="No pools are open yet">
        Live pools will appear here with their real member counts, price tiers and deadlines as soon as they are
        published.
      </EmptyState>
    );
  }
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <PoolCard key={p.id} pool={p} now={now} />
      ))}
    </div>
  );
}

async function Categories() {
  await connection();
  const categories = await listCategories();
  return (
    <ul className="mt-8 flex flex-wrap gap-2">
      {categories.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/poolx/categories/${c.slug}`}
            className="border-rule hover:border-ink inline-block rounded-full border px-4 py-2 text-sm"
          >
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
