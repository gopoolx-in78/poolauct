import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Media } from "@/modules/core/media";
import { requireStaff } from "@/modules/core/server/auth";
import { AUCTION_STATUS_LABEL } from "@/modules/auction/types";
import { cancelAuctionAction, closeAuctionAction, publishAuctionAction } from "../actions";
import { loadListingOptions } from "../admin-data";
import { auctionToValues, type AdminAuction } from "../form-data";
import { ListingForm } from "../listing-form";
import { MediaManager } from "../../media-manager";

export const metadata = { title: "Auction" };

const NOTICES: Record<string, string> = {
  saved: "Draft saved.",
  published: "Published. The deposit amount and terms are now frozen.",
  cancelled: "Auction cancelled. Every paid deposit has been queued for a full refund.",
  closed: "Auction closed. Results, refunds and the winner’s invoice have been created.",
  "photo-saved": "Photo caption saved.",
  "photo-moved": "Photo order updated.",
  "photo-removed": "Photo removed.",
};

export default function AdminAuctionPage({ params, searchParams }: PageProps<"/admin/auctions/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[48rem]" />}>
      <AdminAuctionView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminAuctionView({
  params,
  searchParams,
}: Pick<PageProps<"/admin/auctions/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const account = await requireStaff(`/admin/auctions/${id}`, "auction.listings.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: media }, sp] = await Promise.all([
    supabase.schema("api").rpc("auction_admin_get", { p_auction: id }),
    supabase.schema("api").rpc("auction_admin_media_list", { p_auction: id }),
    searchParams,
  ]);
  const a = data as AdminAuction | null;
  if (!a) notFound();
  const can = (p: string) => account.permissions.includes(p);
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const isDraft = a.rawStatus === "DRAFT";
  const ended = a.status === "ENDED";

  return (
    <div className="max-w-5xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/auctions" className="hover:underline">
          Auctions
        </Link>{" "}
        / {a.slug}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl">{a.title}</h1>
        <Badge tone={a.status === "LIVE" ? "success" : isDraft ? "warning" : "neutral"}>
          {AUCTION_STATUS_LABEL[a.status]}
        </Badge>
      </div>
      {notice ? (
        <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Deposit</dt>
          <dd className="font-mono">
            {a.depositAmountPaise ? formatINR(paise(a.depositAmountPaise)) : "calculated at publish"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Starting price</dt>
          <dd className="font-mono">{formatINR(paise(a.startingPricePaise))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Reserve</dt>
          <dd className="font-mono">{a.reservePricePaise ? formatINR(paise(a.reservePricePaise)) : "none"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Current bid</dt>
          <dd className="font-mono">
            {a.currentBidPaise ? formatINR(paise(a.currentBidPaise)) : "—"} ({a.bidCount} bids)
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Participants / paid deposits</dt>
          <dd className="font-mono">
            {a.participants} / {a.paidDeposits}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Window</dt>
          <dd>
            {formatIST(a.startsAt)} → {formatIST(a.endsAt)}
          </dd>
        </div>
        {a.termsVersion ? (
          <div>
            <dt className="text-ink-muted">Terms version</dt>
            <dd className="font-mono text-xs">{a.termsVersion}</dd>
          </div>
        ) : null}
        {a.result ? (
          <div>
            <dt className="text-ink-muted">Result</dt>
            <dd>
              {a.result.outcome.replaceAll("_", " ")}
              {a.result.finalPricePaise ? ` · ${formatINR(paise(a.result.finalPricePaise))}` : ""}
            </dd>
          </div>
        ) : null}
        {a.cancelReason ? (
          <div className="sm:col-span-3">
            <dt className="text-ink-muted">Cancellation reason</dt>
            <dd>{a.cancelReason}</dd>
          </div>
        ) : null}
      </dl>
      {!isDraft ? (
        <p className="mt-4 text-sm">
          <Link href={`/auctions/${a.slug}`} className="underline underline-offset-4">
            View public page
          </Link>
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-4">
        {isDraft && can("auction.listings.approve") ? (
          <form action={publishAuctionAction}>
            <input type="hidden" name="auctionId" value={a.id} />
            <Button type="submit">Publish auction</Button>
          </form>
        ) : null}
        {ended && can("auction.close.force") ? (
          <form action={closeAuctionAction}>
            <input type="hidden" name="auctionId" value={a.id} />
            <Button type="submit" variant="secondary">
              Close now and settle
            </Button>
          </form>
        ) : null}
      </div>

      {(a.rawStatus === "SCHEDULED" || a.rawStatus === "LIVE") && can("auction.cancel") ? (
        <section aria-labelledby="cancel-h" className="border-danger mt-10 border-l-4 pl-4">
          <h2 id="cancel-h" className="text-2xl">
            Cancel auction
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            All {a.paidDeposits} paid deposit(s) will be refunded in full. This cannot be undone.
          </p>
          <form action={cancelAuctionAction} className="mt-4 grid max-w-xl gap-3">
            <input type="hidden" name="auctionId" value={a.id} />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Reason</span>
              <select name="kind" className="border-rule bg-surface h-11 rounded border px-3" defaultValue="ADMIN">
                <option value="ADMIN">Cancelled by the platform</option>
                <option value="SELLER_WITHDREW">Seller withdrew / item unavailable</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Explanation (recorded in the audit log)</span>
              <textarea
                name="reason"
                rows={2}
                required
                minLength={5}
                className="border-rule bg-surface rounded border px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" /> I understand bidders&rsquo; deposits will be refunded and the
              auction ends now.
            </label>
            <Button type="submit" variant="danger" className="justify-self-start">
              Cancel auction
            </Button>
          </form>
        </section>
      ) : null}

      <div className="mt-12">
        <MediaManager target="auction" ownerId={id} items={(media ?? []) as Media[]} editable={isDraft} />
      </div>

      {isDraft ? (
        <section aria-labelledby="edit-h" className="mt-12">
          <h2 id="edit-h" className="text-2xl">
            Edit draft
          </h2>
          <div className="mt-6">
            <EditForm auction={a} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

async function EditForm({ auction }: { auction: AdminAuction }) {
  const { categories, depositPolicy } = await loadListingOptions();
  return (
    <ListingForm
      auctionId={auction.id}
      initial={auctionToValues(auction)}
      categories={categories}
      depositPolicy={depositPolicy}
    />
  );
}
