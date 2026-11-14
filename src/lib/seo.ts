import type { Metadata } from "next";

export type SocialImage = { url: string; width: number; height: number; alt: string };

/**
 * Per-page metadata with unique title/description, canonical URL and social tags. An `image` (e.g. a blog cover)
 * replaces the site's default Open Graph image for that page.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  image,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  image?: SocialImage;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, ...(image ? { images: [image] } : {}) },
    twitter: image
      ? { title, description, card: "summary_large_image", images: [{ url: image.url, alt: image.alt }] }
      : { title, description },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
