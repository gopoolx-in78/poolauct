import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, Container, SectionHeading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How it works — PoolX buying pools and online auctions",
  description:
    "Step-by-step guide to joining a PoolX buying pool and to bidding in an online auction, including contributions, deposits and refunds.",
  path: "/how-it-works",
});

const poolx = [
  "Find a pool and read its tiers, deadline, contribution and withdrawal rules.",
  "Choose your quantity and pay your contribution through our payment partner.",
  "Your place counts once the payment is confirmed to our servers.",
  "As members join, the pool can unlock better price tiers.",
  "When the pool’s conditions are met, the deal is locked and individual orders are created.",
  "If a pool is cancelled or expires without meeting its conditions, contributions are refunded as published in the pool’s rules.",
];

const auctions = [
  "Open an auction and review the asset, inspection details, charges, terms and the deposit amount.",
  "Log in or register, complete bidder verification and accept the participation terms.",
  "Pay the refundable participation deposit for that auction.",
  "Once the payment provider confirms the payment to our servers, bidding opens for you in that auction.",
  "Bid as often as you like in that auction. Bids are accepted and timed by our servers, not your browser.",
  "When the auction closes, non-winning participants’ deposits become eligible for a full refund automatically.",
  "The winner’s deposit is credited against the final invoice, which itemises any other charges and taxes.",
];

export default function HowItWorksPage() {
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/how-it-works", label: "How It Works" },
          ]}
        />
      </Container>
      <Container className="py-12 md:py-16">
        <h1 className="max-w-4xl text-5xl md:text-6xl">How it works</h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-lg">
          Two marketplaces with different rules. Here is exactly what happens in each.
        </p>
      </Container>

      <Container className="grid gap-16 lg:grid-cols-2">
        <section id="poolx" data-module="poolx" aria-labelledby="hiw-poolx" className="scroll-mt-24">
          <SectionHeading eyebrow="PoolX" title="Joining a buying pool" id="hiw-poolx" />
          <ol className="mt-8 space-y-4">
            {poolx.map((s, i) => (
              <li key={s} className="border-rule flex gap-4 border-t pt-4">
                <span className="text-accent font-mono">{String(i + 1).padStart(2, "0")}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <ButtonLink href="/poolx" variant="accent" className="mt-8">
            Explore PoolX
          </ButtonLink>
        </section>

        <section id="auctions" data-module="auction" aria-labelledby="hiw-auctions" className="scroll-mt-24">
          <SectionHeading eyebrow="Auctions" title="Bidding in an auction" id="hiw-auctions" />
          <ol className="mt-8 space-y-4">
            {auctions.map((s, i) => (
              <li key={s} className="border-rule flex gap-4 border-t pt-4">
                <span className="text-accent font-mono">{String(i + 1).padStart(2, "0")}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <ButtonLink href="/auctions" variant="accent" className="mt-8">
            Explore Auctions
          </ButtonLink>
        </section>
      </Container>
    </>
  );
}
