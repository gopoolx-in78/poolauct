import { ArrowRight, Gavel, Users } from "lucide-react";
import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { AuctionCard } from "@/components/auction/auction-card";
import { PoolCard } from "@/components/poolx/pool-card";
import { ButtonLink } from "@/components/ui/button";
import { Container, JsonLd, SectionHeading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { formatIST, requestNow } from "@/lib/time";
import { getOpenAuctionsBySlugs } from "@/modules/auction/server/queries";
import {
  getFeaturedSlugs,
  getPublicDocuments,
  getPublicFaqs,
  getSiteDesign,
  seoFor,
} from "@/modules/cms/server/queries";
import { getOpenPoolsBySlugs } from "@/modules/poolx/server/queries";
import type { HomeSection, ThemeConfig } from "@/modules/theme/schema";

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await seoFor("home", {
    title: `${site.name} — Group buying & online auctions in India`,
    description: site.description,
  });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { url: "/", title, description },
  };
}

const modules = [
  {
    key: "poolx",
    href: "/poolx",
    icon: Users,
    eyebrow: "PoolX · Group buying",
    title: "Power of People. Power of Pooling.",
    body: "Join a buying pool for something you already need. As more people join, the pool unlocks bulk-price tiers that individuals rarely get on their own.",
    cta: "Explore PoolX — Join Buying Pools",
  },
  {
    key: "auction",
    href: "/auctions",
    icon: Gavel,
    eyebrow: "Auctions · Second-hand assets",
    title: "Discover it. Inspect it. Bid on it.",
    body: "Online auctions for used cars, two-wheelers, electronics, machinery and more. Every auction uses a refundable participation deposit, so everyone bidding is serious.",
    cta: "Explore Auctions — Discover and Bid",
  },
] as const;

export default async function HomePage() {
  const { config } = await getSiteDesign();
  const sections = config.home.sections.filter((x) => x.enabled).map((x) => x.type);
  // Featured listings (TD-76) follow the marketplaces section, or the hero when that section is off.
  const featuredAfter = sections.includes("marketplaces") ? "marketplaces" : "hero";
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: site.name,
          url: site.url,
        }}
      />
      {sections.map((type) => (
        <Fragment key={type}>
          <HomeSectionView type={type} config={config} />
          {type === featuredAfter ? (
            <Suspense fallback={null}>
              <Featured visible={config.modules} />
            </Suspense>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function HomeSectionView({ type, config }: { type: HomeSection; config: ThemeConfig }) {
  switch (type) {
    case "hero":
      return <Hero hero={config.hero} />;
    case "marketplaces":
      return <Marketplaces visible={config.modules} />;
    case "principles":
      return <Principles />;
    case "how":
      return <How />;
    case "faq":
      return <FaqTeaser />;
    case "blog":
      return <BlogTeaser />;
  }
}

function Hero({ hero }: { hero: ThemeConfig["hero"] }) {
  return (
    <section aria-labelledby="hero-title" className="border-rule border-b">
      <Container className="py-16 md:py-24">
        {hero.eyebrow && <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">{hero.eyebrow}</p>}
        <h1 id="hero-title" className="mt-4 max-w-5xl text-5xl md:text-7xl">
          {hero.heading}
        </h1>
        {hero.subheading && <p className="text-ink-muted mt-6 max-w-2xl text-lg md:text-xl">{hero.subheading}</p>}
      </Container>
    </section>
  );
}

function Marketplaces({ visible }: { visible: ThemeConfig["modules"] }) {
  const shown = modules.filter((m) => visible[m.key].visible);
  if (shown.length === 0) return null;
  return (
    <section aria-label="Choose a marketplace">
      <Container className={`border-rule bg-rule grid gap-px border-x ${shown.length > 1 ? "md:grid-cols-2" : ""}`}>
        {shown.map((m) => (
          <article key={m.key} data-module={m.key} className="bg-paper flex flex-col p-6 md:p-10">
            <div className="flex items-center gap-3">
              <span className="bg-accent text-accent-ink inline-flex size-11 items-center justify-center rounded">
                <m.icon aria-hidden="true" className="size-5" />
              </span>
              <p className="text-accent font-mono text-xs tracking-[0.2em] uppercase">{m.eyebrow}</p>
            </div>
            <h2 className="mt-6 text-3xl md:text-4xl">{m.title}</h2>
            <p className="text-ink-muted mt-4 flex-1 text-lg">{m.body}</p>
            <div className="mt-8">
              <ButtonLink
                href={m.href}
                variant="accent"
                size="lg"
                className="w-full text-center whitespace-normal sm:w-auto"
              >
                {m.cta}
                <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
              </ButtonLink>
            </div>
          </article>
        ))}
      </Container>
    </section>
  );
}

function Principles() {
  return (
    <section aria-labelledby="separate-title" className="mt-20">
      <Container className="grid gap-10 md:grid-cols-[1fr_2fr]">
        <SectionHeading
          eyebrow="Built to keep things separate"
          title="Two businesses, kept apart on purpose"
          id="separate-title"
        />
        <dl className="grid gap-8 sm:grid-cols-2">
          {[
            [
              "Separate money",
              "Pool contributions and auction deposits are recorded in separate ledgers and are never combined into one balance.",
            ],
            [
              "Server-verified payments",
              "A payment counts only after the payment provider confirms it to our servers — never because a browser says so.",
            ],
            [
              "Refundable auction deposits",
              "If you don’t win an auction, your full participation deposit is refunded. If you win, it is credited against your invoice.",
            ],
            [
              "One account",
              "Use the same login for both marketplaces, with separate dashboards for your pools and your auctions.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="border-ink border-t pt-4">
              <dt className="font-display text-xl">{t}</dt>
              <dd className="text-ink-muted mt-2">{d}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function How() {
  return (
    <section aria-labelledby="how-title" className="mt-20">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="How it works" title="See the rules before you take part" id="how-title" />
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
          >
            Read how both marketplaces work <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

async function FaqTeaser() {
  const faqs = (await getPublicFaqs()).slice(0, 4);
  if (faqs.length === 0) return null; // nothing published yet: no empty section
  return (
    <section aria-labelledby="faq-title" className="mt-20">
      <Container className="grid gap-10 md:grid-cols-[1fr_2fr]">
        <div>
          <SectionHeading eyebrow="Questions" title="Frequently asked questions" id="faq-title" />
          <Link
            href="/faq"
            className="mt-4 inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
          >
            All questions <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <dl className="divide-rule divide-y">
          {faqs.map((f) => (
            <div key={f.id} className="py-4">
              <dt className="font-display text-xl">{f.question}</dt>
              <dd className="text-ink-muted mt-2 line-clamp-3">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

async function BlogTeaser() {
  const { items } = await getPublicDocuments("POST", 3, 0);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="blog-title" className="mt-20">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Blog" title="Latest articles" id="blog-title" />
          <Link href="/blog" className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
            All articles <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {items.map((p) => (
            <li key={p.slug} className="border-ink border-t pt-4">
              <h3 className="text-2xl">
                <Link href={`/blog/${p.slug}`} className="underline-offset-4 hover:underline">
                  {p.title}
                </Link>
              </h3>
              <p className="text-ink-muted mt-1 text-sm">{formatIST(p.firstPublishedAt, { withTime: false })}</p>
              {p.summary && <p className="text-ink-muted mt-2">{p.summary}</p>}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Staff-picked pools and auctions (TD-76) with live data; only open listings, and nothing when none are open. */
async function Featured({ visible }: { visible: ThemeConfig["modules"] }) {
  const slugs = await getFeaturedSlugs();
  const now = await requestNow();
  const [pools, auctions] = await Promise.all([
    visible.poolx.visible ? getOpenPoolsBySlugs(slugs.poolx) : [],
    visible.auction.visible ? getOpenAuctionsBySlugs(slugs.auction) : [],
  ]);
  if (pools.length + auctions.length === 0) return null;
  return (
    <section aria-labelledby="featured-title" className="mt-20">
      <Container>
        <SectionHeading eyebrow="Featured" title="Open now" id="featured-title" />
        <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pools.map((p) => (
            <li key={`pool-${p.slug}`} className="grid">
              <PoolCard pool={p} now={now} />
            </li>
          ))}
          {auctions.map((a) => (
            <li key={`auction-${a.slug}`} className="grid">
              <AuctionCard a={a} now={now} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
