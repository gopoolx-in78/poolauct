import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuctionBrowser } from "@/components/auction/auction-browser";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { listAuctionCategories } from "@/modules/auction/server/queries";

async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  return (await listAuctionCategories()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/auctions/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCategory(slug);
  if (!c) return { title: "Category not found", robots: { index: false } };
  return pageMetadata({
    title: `${c.name} auctions`,
    description: `Live and upcoming online auctions for ${c.name.toLowerCase()}, with a refundable deposit on every auction.`,
    path: `/auctions/category/${slug}`,
  });
}

export default function AuctionCategoryPage(props: PageProps<"/auctions/category/[slug]">) {
  return (
    <div data-module="auction">
      <Suspense
        fallback={
          <Container className="py-10">
            <Skeleton className="h-96" />
          </Container>
        }
      >
        <Category {...props} />
      </Suspense>
    </div>
  );
}

async function Category({ params, searchParams }: PageProps<"/auctions/category/[slug]">) {
  const { slug } = await params;
  const c = await getCategory(slug);
  if (!c) notFound();
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/auctions", label: "Auctions" },
            { href: `/auctions/category/${slug}`, label: c.name },
          ]}
        />
      </Container>
      <Container className="py-10">
        <h1 className="text-5xl">{c.name}</h1>
        <div className="mt-8">
          <AuctionBrowser searchParams={searchParams} basePath={`/auctions/category/${slug}`} fixedCategory={slug} />
        </div>
      </Container>
    </>
  );
}
