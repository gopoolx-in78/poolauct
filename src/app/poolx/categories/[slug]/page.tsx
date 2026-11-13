import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PoolBrowser } from "@/components/poolx/pool-browser";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { listCategories } from "@/modules/poolx/server/queries";

async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  const categories = await listCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/poolx/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  return pageMetadata({
    title: `${category.name} buying pools`,
    description: `Open PoolX buying pools for ${category.name.toLowerCase()} — join with others to unlock bulk-price tiers.`,
    path: `/poolx/categories/${slug}`,
  });
}

export default function CategoryPage({ params, searchParams }: PageProps<"/poolx/categories/[slug]">) {
  return (
    <div data-module="poolx">
      <Suspense
        fallback={
          <Container className="py-10">
            <Skeleton className="h-96" />
          </Container>
        }
      >
        <Category params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Category({ params, searchParams }: PageProps<"/poolx/categories/[slug]">) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
            { href: `/poolx/categories/${slug}`, label: category.name },
          ]}
        />
      </Container>
      <Container className="py-10">
        <h1 className="text-5xl">{category.name}</h1>
        {category.description ? <p className="text-ink-muted mt-3 max-w-2xl">{category.description}</p> : null}
        <div className="mt-8">
          <PoolBrowser searchParams={searchParams} basePath={`/poolx/categories/${slug}`} fixedCategory={slug} />
        </div>
      </Container>
    </>
  );
}
