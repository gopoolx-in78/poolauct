import type { Metadata } from "next";

/** Per-page metadata with unique title/description, canonical URL and social tags. */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    twitter: { title, description },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
