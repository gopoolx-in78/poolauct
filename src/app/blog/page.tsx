import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Container, EmptyState } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { formatIST } from "@/lib/time";
import { getPublicDocuments, seoFor } from "@/modules/cms/server/queries";
import { mediaSrc } from "@/modules/core/media";

const LIMIT = 50;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await getPublicDocuments("POST", 1, 0);
  const { title, description } = await seoFor("blog", {
    title: "Blog",
    description: `Articles and updates about group buying with PoolX and online auctions on ${site.name}.`,
  });
  return pageMetadata({ title, description, path: "/blog", noindex: total === 0 });
}

export default async function BlogPage() {
  const { items, total } = await getPublicDocuments("POST", LIMIT, 0);
  return (
    <Container className="py-10">
      <Breadcrumbs
        siteUrl={site.url}
        items={[
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
        ]}
      />
      <h1 className="mt-6 text-5xl">Blog</h1>
      {items.length === 0 ? (
        <EmptyState className="mt-10" title="No articles yet." />
      ) : (
        <ul className="mt-10 max-w-3xl space-y-10">
          {items.map((p) => (
            <li key={p.slug} className="border-ink border-t pt-4">
              {p.cover ? (
                <Image
                  src={mediaSrc(p.cover.thumb.path)}
                  alt={p.cover.alt}
                  width={p.cover.thumb.width}
                  height={p.cover.thumb.height}
                  unoptimized
                  className="bg-ink/5 mb-4 aspect-[16/9] w-full max-w-md object-cover"
                />
              ) : null}
              <h2 className="text-3xl">
                <Link href={`/blog/${p.slug}`} className="underline-offset-4 hover:underline">
                  {p.title}
                </Link>
              </h2>
              <p className="text-ink-muted mt-1 text-sm">
                <time dateTime={p.firstPublishedAt}>{formatIST(p.firstPublishedAt, { withTime: false })}</time>
              </p>
              {p.summary && <p className="text-ink-muted mt-3 text-lg">{p.summary}</p>}
            </li>
          ))}
        </ul>
      )}
      {total > LIMIT && <p className="text-ink-muted mt-10 text-sm">Showing the latest {LIMIT} articles.</p>}
    </Container>
  );
}
