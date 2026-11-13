import { Suspense } from "react";
import { Breadcrumbs, Container, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { requireAccount } from "@/modules/core/server/auth";
import { listCategories } from "@/modules/poolx/server/queries";
import { RequestForm } from "./request-form";

export const metadata = {
  title: "Request a buying pool",
  description: "Ask PoolX to organise a custom or private buying pool for your business, society or group.",
  alternates: { canonical: "/poolx/request" },
};

export default function RequestPoolPage() {
  return (
    <div data-module="poolx">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
            { href: "/poolx/request", label: "Request a pool" },
          ]}
        />
      </Container>
      <Container className="max-w-2xl py-10">
        <h1 className="text-5xl">Request a pool</h1>
        <p className="text-ink-muted mt-3">
          Tell us what your group needs. Our team reviews every request; approved requests become pools with published
          prices, tiers and rules before anyone pays.
        </p>
        <Suspense fallback={<Skeleton className="mt-8 h-[40rem]" />}>
          <RequestLoader />
        </Suspense>
      </Container>
    </div>
  );
}

async function RequestLoader() {
  await requireAccount("/poolx/request");
  const categories = await listCategories();
  return (
    <div className="mt-8">
      <RequestForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </div>
  );
}
