import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { decideDefaultAction } from "../actions";

export const metadata = { title: "Winner defaults" };

type Review = {
  id: string;
  openedAt: string;
  decision: "EXTEND" | "REFUND" | "FORFEIT" | null;
  reason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  secondApproved: boolean;
  auctionTitle: string;
  auctionId: string;
  totalPayablePaise: string;
  amountPaidPaise: string;
  dueAt: string;
  invoiceStatus: string;
  depositPaise: string;
  depositStatus: string;
  winner: string;
};

const NOTICES: Record<string, string> = {
  decided: "Decision recorded.",
  "awaiting-second":
    "Forfeiture proposed. A second, different approver must confirm it before the deposit is forfeited.",
};

export default function DefaultsPage({ searchParams }: PageProps<"/admin/auctions/defaults">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Defaults searchParams={searchParams} />
    </Suspense>
  );
}

async function Defaults({ searchParams }: Pick<PageProps<"/admin/auctions/defaults">, "searchParams">) {
  const account = await requireStaff("/admin/auctions/defaults", "auction.default.review");
  const supabase = await createSupabaseServerClient();
  const [{ data }, sp] = await Promise.all([
    supabase.schema("api").rpc("auction_admin_list_default_reviews"),
    searchParams,
  ]);
  const reviews = (data ?? []) as Review[];
  const canForfeit = account.permissions.includes("auction.default.forfeit");
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="max-w-5xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/auctions" className="hover:underline">
          Auctions
        </Link>{" "}
        / Winner defaults
      </p>
      <h1 className="mt-2 text-4xl">Winner payment defaults</h1>
      <p className="text-ink-muted mt-2 text-sm">
        A winner who misses the payment deadline is reviewed here. Extend the deadline, or void the sale and refund the
        deposit in full. Forfeiture is only possible under an approved policy version and needs two different approvers.
      </p>
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
      {reviews.length === 0 ? (
        <EmptyState className="mt-8" title="No default reviews" />
      ) : (
        <ul className="mt-8 space-y-6">
          {reviews.map((r) => {
            const open = r.decidedAt === null;
            const awaitingSecond = r.decision === "FORFEIT" && !r.secondApproved;
            return (
              <li key={r.id} className="border-rule border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link href={`/admin/auctions/${r.auctionId}`} className="font-display text-xl hover:underline">
                    {r.auctionTitle}
                  </Link>
                  <span className="text-sm">
                    {open ? (awaitingSecond ? "Forfeit awaiting second approver" : "Open") : `Decided: ${r.decision}`}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  Winner {r.winner} · invoice {formatINR(paise(r.totalPayablePaise))} (paid{" "}
                  {formatINR(paise(r.amountPaidPaise))}) · due {formatIST(r.dueAt)} · deposit{" "}
                  {formatINR(paise(r.depositPaise))} ({r.depositStatus.replaceAll("_", " ").toLowerCase()})
                </p>
                {r.reason ? <p className="text-ink-muted mt-1 text-sm">Reason: {r.reason}</p> : null}
                {open || awaitingSecond ? (
                  <form
                    action={decideDefaultAction}
                    className="mt-4 grid gap-3 sm:grid-cols-[12rem_8rem_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="reviewId" value={r.id} />
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Decision</span>
                      <select
                        name="decision"
                        className="border-rule bg-surface h-11 rounded border px-3"
                        defaultValue={awaitingSecond ? "FORFEIT" : "EXTEND"}
                      >
                        {!awaitingSecond ? <option value="EXTEND">Extend deadline</option> : null}
                        {!awaitingSecond ? <option value="REFUND">Void sale, refund deposit</option> : null}
                        {canForfeit ? (
                          <option value="FORFEIT">
                            {awaitingSecond ? "Confirm forfeiture (2nd approver)" : "Propose forfeiture"}
                          </option>
                        ) : null}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Extend (hours)</span>
                      <input
                        name="extendHours"
                        inputMode="numeric"
                        defaultValue="48"
                        className="border-rule bg-surface h-11 rounded border px-3"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Reason (recorded)</span>
                      <input
                        name="reason"
                        required
                        minLength={10}
                        className="border-rule bg-surface h-11 rounded border px-3"
                      />
                    </label>
                    <Button type="submit">Record</Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
