import { ArrowRight, Gavel, Users } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container, JsonLd, SectionHeading } from "@/components/ui/primitives";
import { site } from "@/config/site";

export const metadata = {
  title: { absolute: `${site.name} — Group buying & online auctions in India` },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: `${site.name} — Group buying & online auctions in India`,
    description: site.description,
  },
};

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

export default function HomePage() {
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

      <section aria-labelledby="hero-title" className="border-rule border-b">
        <Container className="py-16 md:py-24">
          <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">Two marketplaces · One account</p>
          <h1 id="hero-title" className="mt-4 max-w-5xl text-5xl md:text-7xl">
            Buy together for better prices. <span className="italic">Bid</span> for what&rsquo;s worth having.
          </h1>
          <p className="text-ink-muted mt-6 max-w-2xl text-lg md:text-xl">
            Pool your demand with other buyers on PoolX, or take part in transparent online auctions for second-hand
            assets. Each marketplace runs on its own rules, with its own payments and records.
          </p>
        </Container>
      </section>

      <section aria-label="Choose a marketplace">
        <Container className="border-rule bg-rule grid gap-px border-x md:grid-cols-2">
          {modules.map((m) => (
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
    </>
  );
}
