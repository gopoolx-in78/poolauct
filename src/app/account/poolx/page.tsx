import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { POOL_STATUS_LABEL, poolxErrorMessage, type PoolStatus } from "@/modules/poolx/types";
import { withdrawFromPoolAction } from "@/app/poolx/actions";
import { OrderPanel, type MemberOrder } from "./order-panel";

export const metadata = { title: "My PoolX activities" };

type Activity = {
  memberships: {
    poolId: string;
    slug: string;
    title: string;
    poolStatus: PoolStatus;
    deadlineAt: string;
    memberStatus: string;
    quantity: number;
    unitLabel: string;
    currentUnitPricePaise: string;
    finalUnitPricePaise: string | null;
    order: MemberOrder | null;
    contributions: {
      id: string;
      status: string;
      amountPaise: string;
      unitPricePaise: string;
      feePaise: string;
      quantity: number;
      createdAt: string;
      confirmedAt: string | null;
    }[];
  }[];
  refunds: {
    id: string;
    poolTitle: string;
    poolSlug: string;
    amountPaise: string;
    reason: string;
    status: string;
    createdAt: string;
    refundedAt: string | null;
  }[];
  requests: { id: string; title: string; status: string; createdAt: string; reviewNote: string | null }[];
};

const MEMBER_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Payment pending",
  ACTIVE: "Member",
  WITHDRAWN: "Withdrawn",
  REMOVED: "Removed",
  FULFILLED: "Fulfilled",
};
const CONTRIBUTION_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  FAILED: "Payment failed",
  EXPIRED: "Expired (not charged)",
  REFUND_PENDING: "Refund in progress",
  REFUNDED: "Refunded",
};
const REFUND_LABEL: Record<string, string> = {
  REFUND_ELIGIBLE: "Queued",
  REFUND_INITIATED: "Initiated",
  REFUND_PROCESSING: "Processing",
  REFUNDED: "Refunded",
  REFUND_FAILED: "Delayed — we’re retrying",
};
const REFUND_REASON: Record<string, string> = {
  MEMBER_WITHDRAWAL: "You withdrew",
  POOL_CANCELLED: "Pool cancelled",
  POOL_EXPIRED: "Minimum not reached",
  LATE_CAPTURE: "Payment arrived after the pool closed to you",
  PRICE_ADJUSTMENT: "Price dropped after you joined",
  MANUAL: "Refund by our team",
};
const NOTICES: Record<string, string> = {
  withdrawn: "You’ve left the pool. Any confirmed contribution is being refunded in full.",
  "request-submitted": "Thanks — your pool request was submitted for review.",
  delivered: "Thanks for confirming delivery.",
  "dispute-opened": "We’ve received your report. Our team will review it and get back to you.",
};

export default function MyPoolxPage({ searchParams }: PageProps<"/account/poolx">) {
  return (
    <>
      <h1 className="text-4xl">My PoolX activities</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Activity({ searchParams }: { searchParams: PageProps<"/account/poolx">["searchParams"] }) {
  await requireAccount("/account/poolx");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("poolx_my_activity");
  const sp = await searchParams;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const errorCode = typeof sp.error === "string" ? sp.error : undefined;
  const confirmPool = typeof sp.withdraw === "string" ? sp.withdraw : undefined;
  const reportOrder = typeof sp.report === "string" ? sp.report : undefined;

  if (error || !data) {
    return (
      <p role="alert" className="border-danger bg-danger/5 mt-8 border-l-4 px-4 py-3 text-sm">
        We couldn&rsquo;t load your activity. Please refresh.
      </p>
    );
  }
  const a = data as Activity;

  return (
    <div className="mt-8 space-y-12">
      {notice ? (
        <p role="status" className="border-success bg-success/5 border-l-4 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      {errorCode ? (
        <p role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
          {poolxErrorMessage(errorCode)}
        </p>
      ) : null}

      <section aria-labelledby="pools-h">
        <h2 id="pools-h" className="text-2xl">
          Pools
        </h2>
        {a.memberships.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="You haven’t joined a pool yet"
            action={
              <Link href="/poolx/pools" className="underline underline-offset-4">
                Browse open pools
              </Link>
            }
          />
        ) : (
          <ul className="mt-4 space-y-4">
            {a.memberships.map((m) => {
              const latest = m.contributions[0];
              const canWithdraw =
                (m.memberStatus === "ACTIVE" && m.poolStatus === "ACTIVE") || m.memberStatus === "PENDING_PAYMENT";
              return (
                <li key={m.poolId} className="border-rule border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/poolx/pools/${m.slug}`} className="font-display text-xl hover:underline">
                        {m.title}
                      </Link>
                      <p className="text-ink-muted mt-1 text-sm">
                        {m.quantity} {m.unitLabel}
                        {m.quantity === 1 ? "" : "s"} · pool {POOL_STATUS_LABEL[m.poolStatus].toLowerCase()} · deadline{" "}
                        {formatIST(m.deadlineAt)}
                      </p>
                    </div>
                    <Badge tone={m.memberStatus === "ACTIVE" ? "success" : "neutral"}>
                      {MEMBER_LABEL[m.memberStatus] ?? m.memberStatus}
                    </Badge>
                  </div>
                  {latest ? (
                    <p className="mt-3 text-sm">
                      Contribution <span className="font-mono">{formatINR(paise(latest.amountPaise))}</span> (
                      {latest.quantity} × {formatINR(paise(latest.unitPricePaise))}
                      {paise(latest.feePaise) > 0n ? ` + fee ${formatINR(paise(latest.feePaise))}` : ""}) —{" "}
                      {CONTRIBUTION_LABEL[latest.status] ?? latest.status}
                    </p>
                  ) : null}
                  {m.order ? (
                    <OrderPanel
                      order={m.order}
                      unitLabel={m.unitLabel}
                      quantity={m.quantity}
                      reportOpen={reportOrder === m.order.id}
                    />
                  ) : null}
                  {canWithdraw ? (
                    confirmPool === m.poolId ? (
                      <form action={withdrawFromPoolAction} className="border-warning bg-warning/5 mt-4 border-l-4 p-3">
                        <input type="hidden" name="poolId" value={m.poolId} />
                        <label className="flex items-start gap-2 text-sm">
                          <input type="checkbox" name="confirm" className="mt-1 size-4" />
                          <span>
                            I want to leave this pool.{" "}
                            {m.memberStatus === "ACTIVE"
                              ? "My confirmed contribution will be refunded in full."
                              : "My pending payment will be cancelled."}
                          </span>
                        </label>
                        <div className="mt-3 flex gap-3">
                          <Button type="submit" variant="danger" size="sm">
                            Withdraw from pool
                          </Button>
                          <Link href="/account/poolx" className="inline-flex h-9 items-center text-sm underline">
                            Keep my place
                          </Link>
                        </div>
                      </form>
                    ) : (
                      <Link
                        href={`/account/poolx?withdraw=${m.poolId}`}
                        className="mt-3 inline-block text-sm underline underline-offset-4"
                      >
                        Withdraw…
                      </Link>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="refunds-h">
        <h2 id="refunds-h" className="text-2xl">
          PoolX refunds
        </h2>
        {a.refunds.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No refunds.</p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Your PoolX refunds</caption>
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th scope="col" className="py-2">
                    Pool
                  </th>
                  <th scope="col">Amount</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {a.refunds.map((r) => (
                  <tr key={r.id} className="border-rule border-t">
                    <td className="py-2">
                      <Link href={`/poolx/pools/${r.poolSlug}`} className="underline">
                        {r.poolTitle}
                      </Link>
                    </td>
                    <td className="font-mono">{formatINR(paise(r.amountPaise))}</td>
                    <td>{REFUND_REASON[r.reason] ?? r.reason}</td>
                    <td>{REFUND_LABEL[r.status] ?? r.status}</td>
                    <td>{formatIST(r.refundedAt ?? r.createdAt, { withTime: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink-muted mt-2 text-xs">
              Refunds go back to the original payment method. Bank processing times vary by provider.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="requests-h">
        <h2 id="requests-h" className="text-2xl">
          Pool requests
        </h2>
        {a.requests.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">
            No requests.{" "}
            <Link href="/poolx/request" className="underline">
              Request a pool
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {a.requests.map((q) => (
              <li key={q.id} className="border-rule flex flex-wrap justify-between gap-2 border-b pb-2">
                <span>{q.title}</span>
                <span className="text-ink-muted">
                  {q.status.replaceAll("_", " ").toLowerCase()} · {formatIST(q.createdAt, { withTime: false })}
                </span>
                {q.reviewNote ? <p className="text-ink-muted w-full">Note: {q.reviewNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
