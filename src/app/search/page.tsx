import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuctionCard } from "@/components/auction/auction-card";
import { PoolCard } from "@/components/poolx/pool-card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, Container, EmptyState, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { requestNow } from "@/lib/time";
import { listAuctions } from "@/modules/auction/server/queries";
import { getSiteDesign } from "@/modules/cms/server/queries";
import { listPools } from "@/modules/poolx/server/queries";

// Result pages are thin, query-driven content: keep them out of search engines (R-H2, R-I2).
export const metadata = pageMetadata({
  title: "Search pools and auctions",
  description: "Search open PoolX buying pools and live or upcoming auctions in one place.",
  path: "/search",
  noindex: true,
});

const PER_MODULE = 6;

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/search", label: "Search" },
          ]}
        />
      </Container>
      <Container className="py-10">
        <h1 className="text-5xl">Search</h1>
        <p className="text-ink-muted mt-3 max-w-2xl">
          Find buying pools and auctions by product, brand or model. Prices, members and bids are live.
        </p>
        <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (raw ?? "").trim().slice(0, 100);
  const { config } = await getSiteDesign();
  const showPools = config.modules.poolx.visible;
  const showAuctions = config.modules.auction.visible;

  const form = (
    <form method="get" action="/search" role="search" className="border-rule mt-8 flex flex-wrap gap-3 border-y py-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        Search pools and auctions
        <input
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          required
          className="border-rule bg-surface h-11 rounded border px-3 text-base"
        />
      </label>
      <Button type="submit" className="self-end">
        Search
      </Button>
    </form>
  );
  if (!q) return form;

  const now = await requestNow();
  const [pools, auctions] = await Promise.all([
    showPools ? listPools({ search: q, limit: PER_MODULE }) : null,
    showAuctions ? listAuctions({ view: "all", search: q, limit: PER_MODULE }) : null,
  ]);
  const total = (pools?.total ?? 0) + (auctions?.total ?? 0);
  const enc = encodeURIComponent(q);

  return (
    <>
      {form}
      <p role="status" className="text-ink-muted mt-6">
        {total === 1 ? "1 result" : `${total} results`} for “{q}”
      </p>
      {total === 0 ? (
        <EmptyState className="mt-6" title="Nothing matches yet">
          Try a shorter or more general word, or browse{" "}
          {showPools ? (
            <Link href="/poolx/pools" className="text-ink underline underline-offset-4">
              all pools
            </Link>
          ) : null}
          {showPools && showAuctions ? " or " : null}
          {showAuctions ? (
            <Link href="/auctions/browse" className="text-ink underline underline-offset-4">
              all auctions
            </Link>
          ) : null}
          .
        </EmptyState>
      ) : null}
      {pools && pools.total > 0 ? (
        <section aria-labelledby="pool-results" className="mt-10" data-module="poolx">
          <ResultsHeading
            id="pool-results"
            title={`Buying pools (${pools.total})`}
            more={pools.total > pools.items.length ? `/poolx/pools?q=${enc}` : null}
            moreLabel={`All ${pools.total} matching pools`}
          />
          <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pools.items.map((p) => (
              <li key={p.id} className="grid">
                <PoolCard pool={p} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {auctions && auctions.total > 0 ? (
        <section aria-labelledby="auction-results" className="mt-10" data-module="auction">
          <ResultsHeading
            id="auction-results"
            title={`Live and upcoming auctions (${auctions.total})`}
            more={auctions.total > auctions.items.length ? `/auctions/browse?q=${enc}` : null}
            moreLabel={`All ${auctions.total} matching auctions`}
          />
          <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {auctions.items.map((a) => (
              <li key={a.slug} className="grid">
                <AuctionCard a={a} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ResultsHeading({
  id,
  title,
  more,
  moreLabel,
}: {
  id: string;
  title: string;
  more: string | null;
  moreLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 id={id} className="text-3xl">
        {title}
      </h2>
      {more ? (
        <Link href={more} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
          {moreLabel} <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
