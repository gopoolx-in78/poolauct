import { Breadcrumbs, Container } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Sell an asset by auction",
  description:
    "How listing a used car, two-wheeler, machinery or other asset for online auction works, and what sellers need to provide.",
  path: "/auctions/sell",
});

const needs = [
  "Proof of ownership (for vehicles: the registration certificate and transfer forms at handover)",
  "Honest condition, accident and damage disclosures",
  "Photos and, for vehicles, a walk-around video",
  "Where the asset can be inspected and collected",
  "A starting price, an optional reserve price and any charges the buyer must pay",
];

export default function SellPage() {
  return (
    <div data-module="auction">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/auctions", label: "Auctions" },
            { href: "/auctions/sell", label: "Sell" },
          ]}
        />
      </Container>
      <Container className="max-w-3xl py-12">
        <h1 className="text-5xl">Sell an asset by auction</h1>
        <p className="text-ink-muted mt-4 text-lg">
          Listings are reviewed and published by our team. Every auction requires bidders to pay a refundable deposit,
          so the people bidding on your asset are serious.
        </p>
        <h2 className="mt-10 text-2xl">What you&rsquo;ll need</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          {needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <h2 className="mt-10 text-2xl">How to start</h2>
        <p className="mt-3">
          Online seller onboarding is being set up. Until it opens, listings are created by our team on behalf of
          verified sellers — contact details will be published on the Contact page.
        </p>
      </Container>
    </div>
  );
}
