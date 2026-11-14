import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Pager, offsetParam, qp } from "../../admin-kit";
import { DOMAINS, DOMAIN_LABEL, FinanceNav } from "../finance-nav";

export const metadata = { title: "Payments" };

const LIMIT = 50;
const STATUSES = ["CREATED", "PENDING", "CAPTURED", "FAILED", "EXPIRED", "REVERSED"] as const;
type Payment = {
  id: string;
  domain: "poolx" | "auction";
  purpose: string;
  status: string;
  amountPaise: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  failureCode: string | null;
  userEmail: string;
  createdAt: string;
  capturedAt: string | null;
};

export default function PaymentsPage({ searchParams }: PageProps<"/admin/finance/payments">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

async function Payments({ searchParams }: Pick<PageProps<"/admin/finance/payments">, "searchParams">) {
  await requireStaff("/admin/finance/payments", "finance.ledger.read");
  const sp = await searchParams;
  const domain = DOMAINS.find((d) => d === qp(sp, "domain")) ?? "";
  const status = STATUSES.find((s) => s === qp(sp, "status")) ?? "";
  const q = qp(sp, "q") ?? "";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("admin_list_payments", {
    p_domain: domain || null,
    p_status: status || null,
    p_search: q || null,
    p_limit: LIMIT,
    p_offset: offset,
  });
  const list = (data ?? { total: 0, items: [] }) as { total: number; items: Payment[] };

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Finance" }]} />
      <h1 className="mt-2 text-4xl">Payments</h1>
      <FinanceNav current="/admin/finance/payments" />
      <p className="text-ink-muted mt-4 text-sm">
        Every payment attempt across both modules. Status changes only through verified provider events. The sandbox
        provider is test-only — no real money moves.
      </p>
      <form role="search" action="/admin/finance/payments" className="mt-4 flex flex-wrap items-end gap-3">
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
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Email, payment or order ID</span>
          <input name="q" defaultValue={q} className="border-rule bg-surface h-11 w-72 rounded border px-3" />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState className="mt-8" title="No payments match" />
      ) : (
        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">Payment attempts</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Created
                </th>
                <th scope="col">Module · purpose</th>
                <th scope="col">User</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Provider references</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <tr key={p.id} className="border-rule border-t align-top">
                  <td className="py-2">{formatIST(p.createdAt)}</td>
                  <td>
                    {DOMAIN_LABEL[p.domain]} · {p.purpose.replaceAll("_", " ").toLowerCase()}
                  </td>
                  <td className="break-all">{p.userEmail}</td>
                  <td className="font-mono">{formatINR(paise(p.amountPaise))}</td>
                  <td>
                    {p.status.toLowerCase()}
                    {p.failureCode ? <span className="text-ink-muted block text-xs">{p.failureCode}</span> : null}
                    {p.capturedAt ? (
                      <span className="text-ink-muted block text-xs">{formatIST(p.capturedAt)}</span>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs break-all">
                    {p.provider ?? "—"}
                    {p.providerOrderId ? <span className="block">{p.providerOrderId}</span> : null}
                    {p.providerPaymentId ? <span className="block">{p.providerPaymentId}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        basePath="/admin/finance/payments"
        params={{ domain, status, q }}
        total={list.total}
        limit={LIMIT}
        offset={offset}
      />
    </>
  );
}
