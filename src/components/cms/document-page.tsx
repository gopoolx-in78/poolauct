import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, Container, JsonLd } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { formatIST } from "@/lib/time";
import { getPublicDocument, type DocumentKind } from "@/modules/cms/server/queries";
import { mediaSrc } from "@/modules/core/media";
import { Markdown } from "./markdown";

const BASE: Record<DocumentKind, { path: string; label: string }> = {
  POST: { path: "/blog", label: "Blog" },
  PAGE: { path: "/info", label: "Information" },
};

export async function documentMetadata(kind: DocumentKind, slug: string): Promise<Metadata> {
  const doc = await getPublicDocument(kind, slug);
  if (!doc) return { title: "Not found", robots: { index: false } };
  return pageMetadata({
    title: doc.seoTitle ?? doc.title,
    description: doc.seoDescription ?? (doc.summary || `${doc.title} — ${site.name}`),
    path: `${BASE[kind].path}/${slug}`,
    image: doc.cover
      ? {
          url: mediaSrc(doc.cover.display.path),
          width: doc.cover.display.width,
          height: doc.cover.display.height,
          alt: doc.cover.alt,
        }
      : undefined,
  });
}

/** A published CMS page or blog post. The body is Markdown rendered by the sanitising renderer. */
export async function DocumentView({ kind, slug }: { kind: DocumentKind; slug: string }) {
  const doc = await getPublicDocument(kind, slug);
  if (!doc) notFound();
  const path = `${BASE[kind].path}/${slug}`;
  const crumbs =
    kind === "POST"
      ? [
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
          { href: path, label: doc.title },
        ]
      : [
          { href: "/", label: "Home" },
          { href: path, label: doc.title },
        ];
  return (
    <Container className="py-10">
      <Breadcrumbs siteUrl={site.url} items={crumbs} />
      {kind === "POST" && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: doc.title,
            datePublished: doc.firstPublishedAt,
            dateModified: doc.publishedAt,
            url: `${site.url}${path}`,
            ...(doc.cover ? { image: mediaSrc(doc.cover.display.path) } : {}),
          }}
        />
      )}
      <article className="mt-6 max-w-3xl">
        <h1 className="text-5xl">{doc.title}</h1>
        {kind === "POST" && (
          <p className="text-ink-muted mt-3 text-sm">
            <time dateTime={doc.firstPublishedAt}>{formatIST(doc.firstPublishedAt, { withTime: false })}</time>
            {doc.publishedAt !== doc.firstPublishedAt && (
              <> · Updated {formatIST(doc.publishedAt, { withTime: false })}</>
            )}
          </p>
        )}
        {doc.summary && <p className="text-ink-muted mt-4 text-xl">{doc.summary}</p>}
        {doc.cover ? (
          <Image
            src={mediaSrc(doc.cover.display.path)}
            alt={doc.cover.alt}
            width={doc.cover.display.width}
            height={doc.cover.display.height}
            unoptimized
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 768px) 48rem, 100vw"
            className="bg-ink/5 mt-6 w-full"
          />
        ) : null}
        <Markdown source={doc.body} images={doc.images ?? {}} className="mt-6 text-lg" />
      </article>
    </Container>
  );
}
