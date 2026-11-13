import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Pager, offsetParam, qp } from "../../admin-kit";
import { DOMAINS, DOMAIN_LABEL, FinanceNav } from "../finance-nav";

export const metadata = { title: "Refunds" };

const LIMIT = 50;
const STATUSES = ["REFUND_ELIGIBLE", "REFUND_INITIATED", "REFUND_PROCESSING", "REFUNDED", "REFUND_FAILED"] as const;
type Refund = {
  domain: "poolx" | "auction";
  id: string;
  reason: string;
  status: string;
  amountPaise: string;
  attempts: number;
  lastError: string | null;
  providerRefundId: string | null;
  createdAt: string;
  refundedAt: string | null;
  subject: string;
  userEmail: string;
};

export default function RefundsPage({ searchParams }: PageProps<"/admin/finance/refunds">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Refunds searchParams={searchParams} />
    </Suspense>
  );
}

async function Refunds({ searchParams }: Pick<PageProps<"/admin/finance/refunds">, "searchParams">) {
  await requireStaff("/admin/finance/refunds", "finance.ledger.read");
  const sp = await searchParams;
  const domain = DOMAINS.find((d) => d === qp(sp, "domain")) ?? "";
  const status = STATUSES.find((s) => s === qp(sp, "status")) ?? "";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("admin_list_refunds", {
    p_domain: domain || null,
    p_status: status || null,
    p_limit: LIMIT,
    p_offset: offset,
  });
  const list = (data ?? { total: 0, items: [] }) as { total: number; items: Refund[] };

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Finance" }]} />
      <h1 className="mt-2 text-4xl">Refunds</h1>
      <FinanceNav current="/admin/finance/refunds" />
      <p className="text-ink-muted mt-4 text-sm">
        A refund shows as refunded only after the payment provider confirms it. Failed auction deposit refunds can be
        retried from Auction deposits.
      </p>
      <form role="search" action="/admin/finance/refunds" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Module</span>
          <select name="domain" defaultValue={domain} className="border-rule bg-surface h-11 rounded border px-3">
            <option value="">Both modules</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={status} className="border-rule bg-surface h-11 rounded border px-3">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState className="mt-8" title="No refunds match" />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">Refunds</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Created
                </th>
                <th scope="col">Module · for</th>
                <th scope="col">User</th>
                <th scope="col">Amount</th>
                <th scope="col">Reason</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => (
                <tr key={r.domain + r.id} className="border-rule border-t align-top">
                  <td className="py-2">{formatIST(r.createdAt)}</td>
                  <td>
                    {DOMAIN_LABEL[r.domain]} · {r.subject}
                  </td>
                  <td className="break-all">{r.userEmail}</td>
                  <td className="font-mono">{formatINR(paise(r.amountPaise))}</td>
                  <td>{r.reason.replaceAll("_", " ").toLowerCase()}</td>
                  <td>
                    {r.status.replaceAll("_", " ").toLowerCase()}
                    {r.refundedAt ? (
                      <span className="text-ink-muted block text-xs">{formatIST(r.refundedAt)}</span>
                    ) : null}
                    {r.providerRefundId ? (
                      <span className="text-ink-muted block font-mono text-xs">{r.providerRefundId}</span>
                    ) : null}
                    {r.lastError ? (
                      <span className="text-danger block text-xs">
                        {r.lastError} (attempt {r.attempts})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        basePath="/admin/finance/refunds"
        params={{ domain, status }}
        total={list.total}
        limit={LIMIT}
        offset={offset}
      />
    </>
  );
}
