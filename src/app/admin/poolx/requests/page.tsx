import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { reviewRequestAction } from "../actions";

export const metadata = { title: "Pool requests" };

type Req = {
  id: string;
  title: string;
  product: string;
  description: string;
  status: string;
  category: string | null;
  estimatedQuantity: number | null;
  targetParticipants: number | null;
  expectedUnitPricePaise: string | null;
  deliveryLocation: string;
  neededBy: string | null;
  createdAt: string;
  reviewNote: string | null;
};

export default function RequestsPage({ searchParams }: PageProps<"/admin/poolx/requests">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Requests searchParams={searchParams} />
    </Suspense>
  );
}

async function Requests({ searchParams }: { searchParams: PageProps<"/admin/poolx/requests">["searchParams"] }) {
  await requireStaff("/admin/poolx/requests", "poolx.requests.review");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_admin_list_requests");
  const requests = (data ?? []) as Req[];
  const sp = await searchParams;
  return (
    <div className="max-w-4xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/poolx" className="hover:underline">
          PoolX
        </Link>{" "}
        / Requests
      </p>
      <h1 className="mt-2 text-4xl">Pool requests</h1>
      {sp.notice === "reviewed" ? (
        <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-2 text-sm">
          Decision saved.
        </p>
      ) : null}
      {typeof sp.error === "string" ? (
        <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-2 text-sm">
          {sp.error}
        </p>
      ) : null}
      {requests.length === 0 ? (
        <EmptyState className="mt-8" title="No requests yet" />
      ) : (
        <ul className="mt-8 space-y-6">
          {requests.map((r) => (
            <li key={r.id} className="border-rule border p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl">{r.title}</h2>
                <Badge tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>
                  {r.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-ink-muted mt-1 text-sm">
                {r.product}
                {r.category ? ` · ${r.category}` : ""} · {r.deliveryLocation} · submitted{" "}
                {formatIST(r.createdAt, { withTime: false })}
              </p>
              <p className="mt-3 text-sm whitespace-pre-line">{r.description}</p>
              <p className="text-ink-muted mt-2 text-xs">
                Qty {r.estimatedQuantity ?? "—"} · participants {r.targetParticipants ?? "—"} · expected price{" "}
                {r.expectedUnitPricePaise ? formatINR(paise(r.expectedUnitPricePaise)) : "—"} · needed by{" "}
                {r.neededBy ?? "—"}
              </p>
              {r.status === "SUBMITTED" || r.status === "UNDER_REVIEW" ? (
                <form action={reviewRequestAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="requestId" value={r.id} />
                  <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
                    Note to requester
                    <input name="note" maxLength={1000} className="border-rule bg-surface h-10 rounded border px-3" />
                  </label>
                  <Button type="submit" name="decision" value="APPROVED" size="sm">
                    Approve
                  </Button>
                  <Button type="submit" name="decision" value="UNDER_REVIEW" size="sm" variant="secondary">
                    Mark under review
                  </Button>
                  <Button type="submit" name="decision" value="REJECTED" size="sm" variant="danger">
                    Reject
                  </Button>
                </form>
              ) : r.reviewNote ? (
                <p className="mt-3 text-sm">Note: {r.reviewNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
