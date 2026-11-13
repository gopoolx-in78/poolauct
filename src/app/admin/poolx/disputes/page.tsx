import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { resolveDisputeAction } from "../actions";

export const metadata = { title: "PoolX disputes" };

type Dispute = {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  resolutionNote: string | null;
  orderId: string;
  orderStatus: string;
  orderAmountPaise: string;
  poolTitle: string;
  poolId: string;
  refundablePaise: string;
};

export default function DisputesPage({ searchParams }: PageProps<"/admin/poolx/disputes">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Disputes searchParams={searchParams} />
    </Suspense>
  );
}

async function Disputes({ searchParams }: { searchParams: PageProps<"/admin/poolx/disputes">["searchParams"] }) {
  const account = await requireStaff("/admin/poolx/disputes");
  const canResolve = account.permissions.includes("poolx.orders.manage");
  const canRefund = account.permissions.includes("poolx.refunds.manual");
  if (!canResolve && !canRefund) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_admin_list_disputes");
  const disputes = (data ?? []) as Dispute[];
  const sp = await searchParams;

  return (
    <div className="max-w-4xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>{" "}
        / PoolX disputes
      </p>
      <h1 className="mt-2 text-4xl">PoolX disputes</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Refund decisions need the manual-refund permission and are queued to the payment provider; “no action” restores
        the order&rsquo;s previous status.
      </p>
      {sp.notice === "resolved" ? (
        <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-2 text-sm">
          Dispute resolved.
        </p>
      ) : null}
      {typeof sp.error === "string" ? (
        <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-2 text-sm">
          {sp.error}
        </p>
      ) : null}

      {disputes.length === 0 ? (
        <EmptyState className="mt-8" title="No disputes" />
      ) : (
        <ul className="mt-8 space-y-6">
          {disputes.map((d) => (
            <li key={d.id} className="border-rule border p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl">{d.poolTitle}</h2>
                <Badge tone={d.status === "OPEN" ? "warning" : "neutral"}>{d.status.replaceAll("_", " ")}</Badge>
              </div>
              <p className="text-ink-muted mt-1 text-sm">
                Order {formatINR(paise(d.orderAmountPaise))} · {d.orderStatus.toLowerCase()} · opened{" "}
                {formatIST(d.createdAt)} · up to {formatINR(paise(d.refundablePaise))} refundable
              </p>
              <p className="mt-3 text-sm whitespace-pre-line">{d.reason}</p>
              {d.status === "OPEN" ? (
                <form action={resolveDisputeAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <input type="hidden" name="disputeId" value={d.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    Decision note (shown to the member, audited)
                    <textarea name="note" rows={2} className="border-rule bg-surface rounded border px-3 py-2" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Refund amount (₹)
                    <input
                      name="amount"
                      inputMode="decimal"
                      disabled={!canRefund}
                      className="border-rule bg-surface h-11 rounded border px-3 disabled:opacity-50"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3 sm:col-span-2">
                    {canRefund ? (
                      <Button type="submit" name="decision" value="REFUND" size="sm">
                        Refund
                      </Button>
                    ) : null}
                    {canResolve ? (
                      <Button type="submit" name="decision" value="NO_ACTION" size="sm" variant="secondary">
                        Resolve without refund
                      </Button>
                    ) : null}
                  </div>
                </form>
              ) : d.resolutionNote ? (
                <p className="mt-3 text-sm">Resolution: {d.resolutionNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
