import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise, subPaise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import {
  AUCTION_STATUS_LABEL,
  DEPOSIT_LABEL,
  REFUND_REASON_LABEL,
  auctionErrorMessage,
  type AuctionStatus,
  type DepositStatus,
} from "@/modules/auction/types";
import { payInvoiceAction } from "@/app/auctions/actions";

export const metadata = { title: "My auction activities" };

type Activity = {
  deposits: {
    depositId: string;
    auctionSlug: string;
    auctionTitle: string;
    auctionStatus: AuctionStatus;
    amountPaise: string;
    status: DepositStatus;
    paidAt: string | null;
    paymentReference: string | null;
    outcome: "WON" | "NOT_WON" | null;
    refund: {
      status: string;
      amountPaise: string;
      reason: string;
      initiatedAt: string;
      refundedAt: string | null;
      reference: string | null;
    } | null;
    adjustment: { amountPaise: string; at: string } | null;
  }[];
  bids: {
    auctionSlug: string;
    auctionTitle: string;
    auctionStatus: AuctionStatus;
    endsAt: string;
    myHighestBidPaise: string;
    bidCount: number;
    currentBidPaise: string | null;
    isLeading: boolean;
  }[];
  refunds: {
    auctionTitle: string;
    auctionSlug: string;
    amountPaise: string;
    reason: string;
    status: string;
    initiatedAt: string;
    refundedAt: string | null;
    reference: string | null;
  }[];
  invoices: {
    id: string;
    auctionTitle: string;
    auctionSlug: string;
    hammerPricePaise: string;
    charges: { label: string; amountPaise: number }[];
    chargesTotalPaise: string;
    depositCreditPaise: string;
    totalPayablePaise: string;
    amountPaidPaise: string;
    dueAt: string;
    status: string;
    paidAt: string | null;
  }[];
};

const REFUND_STATUS: Record<string, string> = {
  REFUND_ELIGIBLE: "Queued",
  REFUND_INITIATED: "Initiated",
  REFUND_PROCESSING: "Processing",
  REFUNDED: "Refunded",
  REFUND_FAILED: "Delayed — we’re retrying",
};

const fmt = (p: string | null) => (p ? formatINR(paise(p)) : "—");

export default function MyAuctionsPage({ searchParams }: PageProps<"/account/auctions">) {
  return (
    <>
      <h1 className="text-4xl">My auction activities</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Activity({ searchParams }: { searchParams: PageProps<"/account/auctions">["searchParams"] }) {
  await requireAccount("/account/auctions");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("auction_my_activity");
  const sp = await searchParams;
  if (error || !data) {
    return (
      <p role="alert" className="border-danger bg-danger/5 mt-8 border-l-4 px-4 py-3 text-sm">
        We couldn&rsquo;t load your auction activity. Please refresh.
      </p>
    );
  }
  const a = data as Activity;
  const errorCode = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="mt-8 space-y-12">
      {sp.payment === "success" ? (
        <p role="status" className="border-success bg-success/5 border-l-4 px-4 py-3 text-sm">
          Payment received. Your invoice updates as soon as the payment provider confirms it.
        </p>
      ) : null}
      {sp.payment === "failed" ? (
        <p role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
          The payment didn&rsquo;t go through. You can try again.
        </p>
      ) : null}
      {errorCode ? (
        <p role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
          {auctionErrorMessage(errorCode)}
        </p>
      ) : null}

      <section aria-labelledby="inv-h">
        <h2 id="inv-h" className="text-2xl">
          Won auctions
        </h2>
        {a.invoices.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No won auctions yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {a.invoices.map((i) => (
              <li key={i.id} className="border-rule border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/auctions/${i.auctionSlug}`} className="font-display text-xl hover:underline">
                    {i.auctionTitle}
                  </Link>
                  <Badge tone={i.status === "PAID" ? "success" : i.status === "ISSUED" ? "warning" : "neutral"}>
                    {i.status.replace("_", " ")}
                  </Badge>
                </div>
                <table className="mt-3 w-full text-sm">
                  <caption className="sr-only">Invoice for {i.auctionTitle}</caption>
                  <tbody className="font-mono">
                    <tr>
                      <th scope="row" className="py-0.5 text-left font-sans font-normal">
                        Winning bid
                      </th>
                      <td className="text-right">{fmt(i.hammerPricePaise)}</td>
                    </tr>
                    {i.charges.map((c) => (
                      <tr key={c.label}>
                        <th scope="row" className="py-0.5 text-left font-sans font-normal">
                          {c.label}
                        </th>
                        <td className="text-right">{formatINR(paise(c.amountPaise))}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" className="py-0.5 text-left font-sans font-normal">
                        Participation deposit already paid
                      </th>
                      <td className="text-right">−{fmt(i.depositCreditPaise)}</td>
                    </tr>
                    <tr className="border-rule border-t font-medium">
                      <th scope="row" className="py-1 text-left font-sans">
                        Total payable
                      </th>
                      <td className="text-right">{fmt(i.totalPayablePaise)}</td>
                    </tr>
                    {paise(i.amountPaidPaise) > 0n ? (
                      <tr>
                        <th scope="row" className="py-0.5 text-left font-sans font-normal">
                          Paid
                        </th>
                        <td className="text-right">{fmt(i.amountPaidPaise)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                <p className="text-ink-muted mt-2 text-xs">
                  Applicable taxes, if any, are shown as separate lines.{" "}
                  {i.status === "PAID" ? `Paid ${formatIST(i.paidAt!)}.` : `Due by ${formatIST(i.dueAt)}.`}
                </p>
                {i.status === "ISSUED" || i.status === "DEFAULT_REVIEW" ? (
                  <form action={payInvoiceAction} className="mt-3">
                    <input type="hidden" name="invoiceId" value={i.id} />
                    <Button type="submit" size="sm">
                      Pay {formatINR(subPaise(paise(i.totalPayablePaise), paise(i.amountPaidPaise)))}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dep-h" id="deposits">
        <h2 id="dep-h" className="text-2xl">
          My auction deposits
        </h2>
        {a.deposits.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No deposits yet"
            action={
              <Link href="/auctions/browse?view=live" className="underline underline-offset-4">
                Browse live auctions
              </Link>
            }
          />
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">Your refundable auction participation deposits</caption>
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th scope="col" className="py-2">
                    Auction
                  </th>
                  <th scope="col">Deposit</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Payment ref.</th>
                  <th scope="col">Auction status</th>
                  <th scope="col">Deposit status</th>
                  <th scope="col">Refund</th>
                </tr>
              </thead>
              <tbody>
                {a.deposits.map((d) => (
                  <tr key={d.depositId} className="border-rule border-t align-top">
                    <td className="py-2">
                      <Link href={`/auctions/${d.auctionSlug}`} className="underline">
                        {d.auctionTitle}
                      </Link>
                    </td>
                    <td className="font-mono">{fmt(d.amountPaise)}</td>
                    <td>{d.paidAt ? formatIST(d.paidAt) : "—"}</td>
                    <td className="font-mono text-xs break-all">{d.paymentReference ?? "—"}</td>
                    <td>
                      {AUCTION_STATUS_LABEL[d.auctionStatus]}
                      {d.outcome ? ` · ${d.outcome === "WON" ? "won" : "not won"}` : ""}
                    </td>
                    <td>{DEPOSIT_LABEL[d.status]}</td>
                    <td>
                      {d.refund ? (
                        <>
                          {REFUND_STATUS[d.refund.status] ?? d.refund.status} · {fmt(d.refund.amountPaise)}
                          <span className="text-ink-muted block text-xs">
                            {REFUND_REASON_LABEL[d.refund.reason] ?? d.refund.reason} · initiated{" "}
                            {formatIST(d.refund.initiatedAt, { withTime: false })}
                            {d.refund.refundedAt
                              ? ` · refunded ${formatIST(d.refund.refundedAt, { withTime: false })}`
                              : ""}
                            {d.refund.reference ? ` · ref ${d.refund.reference}` : ""}
                          </span>
                        </>
                      ) : d.adjustment ? (
                        <>Credited {fmt(d.adjustment.amountPaise)} to your invoice</>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink-muted mt-2 text-xs">
              Deposits are refunded in full to the original payment method when you don&rsquo;t win. Bank processing
              times vary by provider.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="bids-h">
        <h2 id="bids-h" className="text-2xl">
          My bids
        </h2>
        {a.bids.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No bids yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {a.bids.map((b) => (
              <li key={b.auctionSlug} className="border-rule flex flex-wrap justify-between gap-2 border-b pb-2">
                <Link href={`/auctions/${b.auctionSlug}`} className="underline">
                  {b.auctionTitle}
                </Link>
                <span>
                  {b.bidCount} bid{b.bidCount === 1 ? "" : "s"} · your highest {fmt(b.myHighestBidPaise)} · current{" "}
                  {fmt(b.currentBidPaise)} ·{" "}
                  {b.auctionStatus === "LIVE"
                    ? b.isLeading
                      ? "you’re leading"
                      : "outbid"
                    : AUCTION_STATUS_LABEL[b.auctionStatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ref-h" id="refunds">
        <h2 id="ref-h" className="text-2xl">
          Auction refunds
        </h2>
        {a.refunds.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No refunds.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {a.refunds.map((r) => (
              <li
                key={r.initiatedAt + r.auctionSlug}
                className="border-rule flex flex-wrap justify-between gap-2 border-b pb-2"
              >
                <span>
                  {r.auctionTitle} — {REFUND_REASON_LABEL[r.reason] ?? r.reason}
                </span>
                <span className="font-mono">
                  {fmt(r.amountPaise)} · <span className="font-sans">{REFUND_STATUS[r.status] ?? r.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
