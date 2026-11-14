export type AdminDocument = {
  id: string;
  kind: "PAGE" | "POST";
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  latestRevision: number;
  publishedRevision: number | null;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  latest: {
    title: string;
    summary: string;
    body: string;
    seoTitle: string | null;
    seoDescription: string | null;
  } | null;
  revisions?: { revision: number; title: string; note: string | null; createdAt: string; createdBy: string | null }[];
};

export const KIND_LABEL = { PAGE: "Pages", POST: "Blog posts" } as const;
