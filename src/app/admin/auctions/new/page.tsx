import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requestNow } from "@/lib/time";
import { requireStaff } from "@/modules/core/server/auth";
import { loadListingOptions } from "../admin-data";
import { emptyListingValues } from "../form-data";
import { ListingForm } from "../listing-form";

export const metadata = { title: "New auction" };

export default function NewAuctionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[48rem]" />}>
      <NewAuction />
    </Suspense>
  );
}

async function NewAuction() {
  await requireStaff("/admin/auctions/new", "auction.listings.manage");
  const [{ categories, depositPolicy }, now] = await Promise.all([loadListingOptions(), requestNow()]);
  return (
    <div className="max-w-5xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/auctions" className="hover:underline">
          Auctions
        </Link>{" "}
        / New
      </p>
      <h1 className="mt-2 text-4xl">New auction</h1>
      <p className="text-ink-muted mt-2">
        Auctions are created as drafts. Check every detail, then publish — deposit and price rules freeze on publish.
      </p>
      <div className="mt-8">
        <ListingForm
          initial={emptyListingValues(new Date(now).toISOString())}
          categories={categories}
          depositPolicy={depositPolicy}
        />
      </div>
    </div>
  );
}
