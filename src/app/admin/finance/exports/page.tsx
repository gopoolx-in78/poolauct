import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { requestNow } from "@/lib/time";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs } from "../../admin-kit";
import { DOMAINS, DOMAIN_LABEL, FinanceNav } from "../finance-nav";

export const metadata = { title: "Exports" };

const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

export default function ExportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Exports />
    </Suspense>
  );
}

async function Exports() {
  await requireStaff("/admin/finance/exports", "finance.reports.export");
  const now = await requestNow();
  const field = "border-rule bg-surface h-11 rounded border px-3";
  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Finance" }]} />
      <h1 className="mt-2 text-4xl">Exports</h1>
      <FinanceNav current="/admin/finance/exports" />
      <p className="text-ink-muted mt-4 max-w-3xl text-sm">
        CSV files for one module at a time, up to one year per file. Amounts are in paise (₹1 = 100) so they stay exact.
        Every export is recorded in the audit log.
      </p>
      <form action="/admin/finance/exports/csv" method="get" className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Report</span>
          <select name="kind" className={field}>
            <option value="payments">Payment attempts</option>
            <option value="refunds">Refunds</option>
            <option value="ledger">Ledger entries</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Module</span>
          <select name="domain" className={field}>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">From (IST)</span>
          <input type="date" name="from" required defaultValue={istDate(now - 30 * 86_400_000)} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">To (IST, inclusive)</span>
          <input type="date" name="to" required defaultValue={istDate(now)} className={field} />
        </label>
        <Button type="submit" className="justify-self-start">
          Download CSV
        </Button>
      </form>
    </>
  );
}
