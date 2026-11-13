import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { DEPOSIT_LABEL, type DepositStatus } from "@/modules/auction/types";
import { retryRefundAction } from "../actions";

export const metadata = { title: "Auction deposits" };

type Bucket = Record<string, { count: number; amountPaise: string }>;
type Overview = {
  byStatus: Bucket;
  refundsByStatus: Bucket;
  adjustedTotalPaise: string;
  liabilityPaise: string;
  openDefaultReviews: number;
  recent: {
    id: string;
    status: DepositStatus;
    amountPaise: string;
    paidAt: string | null;
    auctionTitle: string;
    auctionId: string;
    paymentReference: string | null;
    bidder: string;
    refundId: string | null;
    refundStatus: string | null;
    refundError: string | null;
  }[];
};

const REFUND_STATES = ["REFUND_ELIGIBLE", "REFUND_INITIATED", "REFUND_PROCESSING", "REFUNDED", "REFUND_FAILED"];

export default function AdminDepositsPage({ searchParams }: PageProps<"/admin/auctions/deposits">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Deposits searchParams={searchParams} />
    </Suspense>
  );
}

async function Deposits({ searchParams }: Pick<PageProps<"/admin/auctions/deposits">, "searchParams">) {
  const account = await requireStaff("/admin/auctions/deposits", "auction.deposit.read");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, sp] = await Promise.all([
    supabase.schema("api").rpc("auction_admin_deposits_overview"),
    searchParams,
  ]);
  if (error || !data) return <p role="alert">Could not load deposits.</p>;
  const o = data as Overview;
  const canRetry = account.permissions.includes("auction.deposit.refund.retry");
  const sum = (b: Bucket, keys: string[]) =>
    keys.reduce(
      (acc, k) => ({ count: acc.count + (b[k]?.count ?? 0), amount: acc.amount + BigInt(b[k]?.amountPaise ?? "0") }),
      { count: 0, amount: 0n },
    );
  const tile = (label: string, value: string, sub?: string) => (
    <div className="border-rule border p-4">
      <dt className="text-ink-muted text-xs uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-2xl">{value}</dd>
      {sub ? <dd className="text-ink-muted text-xs">{sub}</dd> : null}
    </div>
  );
  const paid = sum(o.byStatus, ["PAID"]);
  const pendingRefund = sum(o.refundsByStatus, ["REFUND_ELIGIBLE", "REFUND_INITIATED", "REFUND_PROCESSING"]);
  const refunded = sum(o.refundsByStatus, ["REFUNDED"]);
  const failed = sum(o.refundsByStatus, ["REFUND_FAILED"]);
  const errorText = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/auctions" className="hover:underline">
          Auctions
        </Link>{" "}
        / Deposits
      </p>
      <h1 className="mt-2 text-4xl">Participation deposits</h1>
      <p className="text-ink-muted mt-2 max-w-3xl text-sm">
        Deposits are held liabilities, not revenue. Each paid deposit is either refunded in full or credited once to the
        winner&rsquo;s invoice. Refund status changes only on provider confirmation.
      </p>
      {sp.notice === "retry-scheduled" ? (
        <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-3 text-sm">
          Refund retry scheduled for the next refund run.
        </p>
      ) : null}
      {errorText ? (
        <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-3 text-sm">
          {errorText}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tile("Deposit liability (ledger)", formatINR(paise(o.liabilityPaise)))}
        {tile("Paid, held", formatINR(paise(paid.amount)), `${paid.count} deposits`)}
        {tile("Refunds pending", formatINR(paise(pendingRefund.amount)), `${pendingRefund.count} refunds`)}
        {tile("Refunded (provider-confirmed)", formatINR(paise(refunded.amount)), `${refunded.count} refunds`)}
        {tile("Refunds failed", formatINR(paise(failed.amount)), `${failed.count} need attention`)}
        {tile(
          "Credited to winners",
          formatINR(paise(o.adjustedTotalPaise)),
          `${o.openDefaultReviews} open default review(s)`,
        )}
      </dl>

      <section aria-labelledby="states-h" className="mt-10">
        <h2 id="states-h" className="text-2xl">
          By state
        </h2>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <table className="text-sm">
            <caption className="text-ink-muted text-left text-xs uppercase">Deposits</caption>
            <tbody>
              {Object.entries(o.byStatus).map(([k, b]) => (
                <tr key={k} className="border-rule border-t">
                  <th scope="row" className="py-1 pr-6 text-left font-normal">
                    {DEPOSIT_LABEL[k as DepositStatus] ?? k}
                  </th>
                  <td className="font-mono">{b.count}</td>
                  <td className="pl-6 text-right font-mono">{formatINR(paise(b.amountPaise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="text-sm">
            <caption className="text-ink-muted text-left text-xs uppercase">Refunds</caption>
            <tbody>
              {REFUND_STATES.flatMap((k) => (o.refundsByStatus[k] ? [[k, o.refundsByStatus[k]] as const] : [])).map(
                ([k, b]) => (
                  <tr key={k} className="border-rule border-t">
                    <th scope="row" className="py-1 pr-6 text-left font-normal">
                      {k.replaceAll("_", " ").toLowerCase()}
                    </th>
                    <td className="font-mono">{b.count}</td>
                    <td className="pl-6 text-right font-mono">{formatINR(paise(b.amountPaise))}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="recent-h" className="mt-10">
        <h2 id="recent-h" className="text-2xl">
          Recent deposits
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">Most recently updated deposits</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Auction
                </th>
                <th scope="col">Bidder</th>
                <th scope="col">Amount</th>
                <th scope="col">Paid</th>
                <th scope="col">Payment ref.</th>
                <th scope="col">Status</th>
                <th scope="col">Refund</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((d) => (
                <tr key={d.id} className="border-rule border-t align-top">
                  <td className="py-2">
                    <Link href={`/admin/auctions/${d.auctionId}`} className="underline">
                      {d.auctionTitle}
                    </Link>
                  </td>
                  <td>{d.bidder}</td>
                  <td className="font-mono">{formatINR(paise(d.amountPaise))}</td>
                  <td>{d.paidAt ? formatIST(d.paidAt) : "—"}</td>
                  <td className="font-mono text-xs break-all">{d.paymentReference ?? "—"}</td>
                  <td>{DEPOSIT_LABEL[d.status] ?? d.status}</td>
                  <td>
                    {d.refundStatus ?? "—"}
                    {d.refundError ? <span className="text-danger block text-xs">{d.refundError}</span> : null}
                    {d.refundStatus === "REFUND_FAILED" && d.refundId && canRetry ? (
                      <form action={retryRefundAction} className="mt-1 flex gap-2">
                        <input type="hidden" name="refundId" value={d.refundId} />
                        <label className="sr-only" htmlFor={`r-${d.id}`}>
                          Reason for retry
                        </label>
                        <input
                          id={`r-${d.id}`}
                          name="reason"
                          required
                          minLength={5}
                          placeholder="Reason"
                          className="border-rule bg-surface h-9 w-32 rounded border px-2 text-xs"
                        />
                        <Button type="submit" size="sm" variant="secondary">
                          Retry
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
