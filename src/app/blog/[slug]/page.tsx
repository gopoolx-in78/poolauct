import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentView, documentMetadata } from "@/components/cms/document-page";
import { Container, Skeleton } from "@/components/ui/primitives";

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return documentMetadata("POST", slug);
}

export default function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-10">
          <Skeleton className="h-96" />
        </Container>
      }
    >
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<PageProps<"/blog/[slug]">, "params">) {
  const { slug } = await params;
  return <DocumentView kind="POST" slug={slug} />;
}
