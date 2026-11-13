import { Suspense } from "react";
import { PoolBrowser } from "@/components/poolx/pool-browser";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Browse buying pools",
  description:
    "Search open PoolX buying pools by product and category, see live member counts, price tiers and deadlines.",
  path: "/poolx/pools",
});

export default function PoolsPage({ searchParams }: PageProps<"/poolx/pools">) {
  return (
    <div data-module="poolx">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
            { href: "/poolx/pools", label: "Pools" },
          ]}
        />
      </Container>
      <Container className="py-10">
        <h1 className="text-5xl">Buying pools</h1>
        <p className="text-ink-muted mt-3 max-w-2xl">
          Prices and member counts are live: they change as members confirm their contributions.
        </p>
        <div className="mt-8">
          <Suspense fallback={<Skeleton className="h-96" />}>
            <PoolBrowser searchParams={searchParams} basePath="/poolx/pools" />
          </Suspense>
        </div>
      </Container>
    </div>
  );
}
