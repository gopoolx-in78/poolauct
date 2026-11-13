import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AUCTION_STATUS_LABEL, type AuctionSummary } from "@/modules/auction/types";

export const metadata = { title: "Auctions" };

type Row = AuctionSummary & { rawStatus: string; updatedAt: string };

export default function AdminAuctionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Auctions />
    </Suspense>
  );
}

async function Auctions() {
  const account = await requireStaff("/admin/auctions", "auction.listings.manage");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("auction_admin_list");
  const rows = (data ?? []) as Row[];
  const can = (p: string) => account.permissions.includes(p);
  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>{" "}
        / Auctions
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Auctions</h1>
        <div className="flex flex-wrap gap-3">
          {can("auction.deposit.read") ? (
            <ButtonLink href="/admin/auctions/deposits" variant="secondary">
              Deposits
            </ButtonLink>
          ) : null}
          {can("auction.default.review") ? (
            <ButtonLink href="/admin/auctions/defaults" variant="secondary">
              Winner defaults
            </ButtonLink>
          ) : null}
          {can("auction.deposit.config") ? (
            <ButtonLink href="/admin/auctions/policy" variant="secondary">
              Deposit policy
            </ButtonLink>
          ) : null}
          <ButtonLink href="/admin/auctions/new">New auction</ButtonLink>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState className="mt-8" title="No auctions yet" />
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">All auctions</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Auction
                </th>
                <th scope="col">Status</th>
                <th scope="col">Deposit</th>
                <th scope="col">Current bid</th>
                <th scope="col">Bids</th>
                <th scope="col">Ends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-rule border-t">
                  <td className="py-3">
                    <Link href={`/admin/auctions/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                    <div className="text-ink-muted text-xs">/{a.slug}</div>
                  </td>
                  <td>
                    <Badge tone={a.status === "LIVE" ? "success" : a.status === "DRAFT" ? "warning" : "neutral"}>
                      {AUCTION_STATUS_LABEL[a.status]}
                    </Badge>
                  </td>
                  <td className="font-mono">
                    {a.depositAmountPaise ? formatINR(paise(a.depositAmountPaise)) : "set at publish"}
                  </td>
                  <td className="font-mono">{a.currentBidPaise ? formatINR(paise(a.currentBidPaise)) : "—"}</td>
                  <td className="font-mono">{a.bidCount}</td>
                  <td>{formatIST(a.endsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
