import Link from "next/link";
import { Suspense } from "react";
import { AuctionCard } from "@/components/auction/auction-card";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, Container, EmptyState, SectionHeading, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { formatINR, rupees, subPaise } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { requestNow } from "@/lib/time";
import {
  getAuctionStats,
  listAuctionCategories,
  listAuctions,
  type AuctionView,
} from "@/modules/auction/server/queries";

export const metadata = pageMetadata({
  title: "Online auctions for used cars and second-hand assets",
  description:
    "Bid in online auctions for used cars, motorcycles, commercial vehicles, electronics, machinery and more. Every auction uses a refundable participation deposit.",
  path: "/auctions",
});

// Worked example from the published deposit rules. Illustrative — not a live auction.
const example = {
  startingBid: rupees(500_000),
  deposit: rupees(2_000),
  increment: rupees(5_000),
  winningBid: rupees(565_000),
};

const steps = [
  [
    "Review the auction",
    "Check the asset details, inspection information, charges, terms, deposit amount and refund conditions.",
  ],
  ["Register & verify", "Sign in, complete bidder verification and accept the auction’s participation terms."],
  [
    "Pay the deposit",
    "Pay the refundable participation deposit for that auction. Bidding opens only after our servers confirm the payment.",
  ],
  ["Bid", "Place as many bids as you like in that auction. Each auction needs its own deposit."],
  ["Result", "Not the winner? Your full deposit is refunded. Winner? It is credited against your final invoice."],
] as const;

export default function AuctionsPage() {
  return (
    <div data-module="auction">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/auctions", label: "Auctions" },
          ]}
        />
      </Container>

      <section aria-labelledby="auction-hero" className="border-rule border-b">
        <Container className="py-12 md:py-20">
          <p className="text-accent font-mono text-xs tracking-[0.2em] uppercase">Auctions · Second-hand assets</p>
          <h1 id="auction-hero" className="mt-4 max-w-4xl text-5xl md:text-7xl">
            Discover it. Inspect it. Bid on it.
          </h1>
          <p className="text-ink-muted mt-6 max-w-2xl text-lg md:text-xl">
            Timed online auctions with server-verified bids, clear charges and a refundable participation deposit on
            every auction.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/auctions/browse?view=live" variant="accent" size="lg">
              See live auctions
            </ButtonLink>
            <ButtonLink href="/register" variant="secondary" size="lg">
              Register as a bidder
            </ButtonLink>
            <ButtonLink href="/auctions/sell" variant="ghost" size="lg">
              Sell an asset
            </ButtonLink>
          </div>
          <Suspense fallback={<Skeleton className="mt-8 h-6 w-64" />}>
            <Stats />
          </Suspense>
        </Container>
      </section>

      {(
        [
          ["live", "Live now", "Bidding open"],
          ["ending", "Ending soon", "Closing within 24 hours"],
          ["upcoming", "Upcoming", "Register and pay your deposit early"],
        ] as [AuctionView, string, string][]
      ).map(([view, title, eyebrow]) => (
        <section key={view} aria-labelledby={`${view}-title`} className="mt-16">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow={eyebrow} title={title} id={`${view}-title`} />
              <Link href={`/auctions/browse?view=${view}`} className="font-medium underline underline-offset-4">
                See all
              </Link>
            </div>
            <Suspense fallback={<Skeleton className="mt-8 h-72" />}>
              <Row view={view} />
            </Suspense>
          </Container>
        </section>
      ))}

      <section aria-labelledby="deposit-title" className="mt-20">
        <Container className="grid gap-10 lg:grid-cols-2">
          <SectionHeading
            eyebrow="Mandatory · Refundable"
            title="How the participation deposit works"
            id="deposit-title"
          >
            Every auction requires a refundable deposit before you can bid. It keeps bidding serious and is never kept
            as a fee: if you don&rsquo;t win, the full amount is refunded; if you win, it&rsquo;s credited to your
            invoice.
          </SectionHeading>
          <figure className="border-ink bg-surface border p-5">
            <figcaption className="flex items-center justify-between gap-2">
              <span className="font-display text-lg">Worked example</span>
              <span className="border-warning text-warning rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase">
                Illustration
              </span>
            </figcaption>
            <dl className="divide-rule mt-4 divide-y font-mono text-sm tabular-nums">
              {[
                ["Starting bid", formatINR(example.startingBid)],
                ["Participation deposit", formatINR(example.deposit)],
                ["Minimum increment", formatINR(example.increment)],
                ["If you don’t win", `${formatINR(example.deposit)} refunded in full`],
                [
                  `If you win at ${formatINR(example.winningBid)}`,
                  `${formatINR(example.deposit)} credited → ${formatINR(subPaise(example.winningBid, example.deposit))} remaining`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="sm:text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-ink-muted mt-3 text-xs">
              Other disclosed charges and applicable taxes are itemised separately on the invoice. Refund credit times
              depend on your bank or payment method.
            </p>
          </figure>
        </Container>
      </section>

      <section aria-labelledby="auction-how" className="mt-20">
        <Container>
          <SectionHeading eyebrow="How bidding works" title="From registration to result" id="auction-how" />
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

      <section aria-labelledby="auction-cats" className="mt-20">
        <Container>
          <SectionHeading eyebrow="What’s auctioned" title="Categories" id="auction-cats" />
          <Suspense fallback={<Skeleton className="mt-8 h-24" />}>
            <Categories />
          </Suspense>
        </Container>
      </section>
    </div>
  );
}

async function Stats() {
  await requestNow();
  const s = await getAuctionStats();
  if (s.live + s.upcoming === 0) return null;
  return (
    <p className="mt-8 text-sm">
      <strong className="font-mono">{s.live}</strong> live · <strong className="font-mono">{s.upcoming}</strong>{" "}
      upcoming right now
    </p>
  );
}

async function Row({ view }: { view: AuctionView }) {
  const now = await requestNow();
  const { items } = await listAuctions({ view, limit: 3 });
  if (items.length === 0) {
    return (
      <EmptyState className="mt-8" title={view === "upcoming" ? "No upcoming auctions yet" : "Nothing here right now"}>
        Auctions appear here with their real bids and countdowns once they are published.
      </EmptyState>
    );
  }
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <AuctionCard key={a.id} a={a} now={now} />
      ))}
    </div>
  );
}

async function Categories() {
  await requestNow();
  const categories = await listAuctionCategories();
  return (
    <ul className="mt-8 flex flex-wrap gap-2">
      {categories.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/auctions/category/${c.slug}`}
            className="border-rule hover:border-ink inline-block rounded-full border px-4 py-2 text-sm"
          >
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
