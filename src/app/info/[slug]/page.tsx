import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentView, documentMetadata } from "@/components/cms/document-page";
import { Container, Skeleton } from "@/components/ui/primitives";

export async function generateMetadata({ params }: PageProps<"/info/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return documentMetadata("PAGE", slug);
}

export default function InfoPage({ params }: PageProps<"/info/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-10">
          <Skeleton className="h-96" />
        </Container>
      }
    >
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/info/[slug]">, "params">) {
  const { slug } = await params;
  return <DocumentView kind="PAGE" slug={slug} />;
}
