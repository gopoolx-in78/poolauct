import { Suspense } from "react";
import { AuctionBrowser } from "@/components/auction/auction-browser";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Browse auctions — live, upcoming and ending soon",
  description:
    "Search live and upcoming online auctions for used cars, two-wheelers, electronics, machinery and other second-hand assets.",
  path: "/auctions/browse",
});

export default function BrowseAuctionsPage({ searchParams }: PageProps<"/auctions/browse">) {
  return (
    <div data-module="auction">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/auctions", label: "Auctions" },
            { href: "/auctions/browse", label: "Browse" },
          ]}
        />
      </Container>
      <Container className="py-10">
        <h1 className="text-5xl">Browse auctions</h1>
        <p className="text-ink-muted mt-3 max-w-2xl">
          Current bids, bid counts and end times are live from our servers.
        </p>
        <div className="mt-8">
          <Suspense fallback={<Skeleton className="h-96" />}>
            <AuctionBrowser searchParams={searchParams} basePath="/auctions/browse" />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
