import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Pager, offsetParam, qp } from "../../admin-kit";
import { DOMAINS, DOMAIN_LABEL, FinanceNav } from "../finance-nav";

export const metadata = { title: "Ledger" };

const LIMIT = 30;
type Ledger = {
  accounts: {
    code: string;
    type: string;
    description: string;
    debitPaise: string;
    creditPaise: string;
    balancePaise: string;
  }[];
  totalJournals: number;
  journals: {
    id: string;
    kind: string;
    referenceType: string;
    referenceId: string;
    postedAt: string;
    entries: { account: string; debitPaise: string; creditPaise: string }[];
  }[];
};

const inr = (v: string) => (v === "0" ? "—" : formatINR(paise(v)));

export default function LedgerPage({ searchParams }: PageProps<"/admin/finance/ledger">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <LedgerView searchParams={searchParams} />
    </Suspense>
  );
}

async function LedgerView({ searchParams }: Pick<PageProps<"/admin/finance/ledger">, "searchParams">) {
  await requireStaff("/admin/finance/ledger", "finance.ledger.read");
  const sp = await searchParams;
  const domain = DOMAINS.find((d) => d === qp(sp, "domain")) ?? "poolx";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema("api")
    .rpc("admin_ledger_overview", { p_domain: domain, p_limit: LIMIT, p_offset: offset });
  const l = data as Ledger | null;
  if (!l) return <p role="alert">Could not load the ledger.</p>;
  const totals = l.accounts.reduce(
    (acc, a) => ({ debit: acc.debit + BigInt(a.debitPaise), credit: acc.credit + BigInt(a.creditPaise) }),
    { debit: 0n, credit: 0n },
  );

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Finance" }]} />
      <h1 className="mt-2 text-4xl">Ledger — {DOMAIN_LABEL[domain]}</h1>
      <FinanceNav current="/admin/finance/ledger" />
      <nav aria-label="Ledger module" className="mt-4 flex gap-4 text-sm">
        {DOMAINS.map((d) => (
          <Link
            key={d}
            href={`/admin/finance/ledger?domain=${d}`}
            aria-current={d === domain ? "page" : undefined}
            className={d === domain ? "font-medium underline underline-offset-4" : "text-ink-muted hover:underline"}
          >
            {DOMAIN_LABEL[d]}
          </Link>
        ))}
      </nav>
      <p className="text-ink-muted mt-3 text-sm">
        Double-entry and insert-only: entries are never edited or deleted. Each module has its own accounts; the two are
        never combined.
      </p>

      <section aria-labelledby="tb-h" className="mt-6">
        <h2 id="tb-h" className="text-2xl">
          Trial balance
        </h2>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">Trial balance for {DOMAIN_LABEL[domain]}</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Account
                </th>
                <th scope="col">Type</th>
                <th scope="col" className="text-right">
                  Debits
                </th>
                <th scope="col" className="text-right">
                  Credits
                </th>
                <th scope="col" className="text-right">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {l.accounts.map((a) => (
                <tr key={a.code} className="border-rule border-t">
                  <th scope="row" className="py-1 text-left font-normal">
                    <span className="font-mono text-xs">{a.code}</span>
                    <span className="text-ink-muted block text-xs">{a.description}</span>
                  </th>
                  <td className="text-xs">{a.type.toLowerCase()}</td>
                  <td className="text-right font-mono">{inr(a.debitPaise)}</td>
                  <td className="text-right font-mono">{inr(a.creditPaise)}</td>
                  <td className="text-right font-mono">{formatINR(paise(a.balancePaise))}</td>
                </tr>
              ))}
              <tr className="border-ink border-t font-medium">
                <th scope="row" className="py-1 text-left">
                  Totals
                </th>
                <td>{totals.debit === totals.credit ? "balanced" : "NOT BALANCED"}</td>
                <td className="text-right font-mono">{formatINR(paise(totals.debit))}</td>
                <td className="text-right font-mono">{formatINR(paise(totals.credit))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="j-h" className="mt-10">
        <h2 id="j-h" className="text-2xl">
          Journals
        </h2>
        <ul className="mt-3 space-y-3">
          {l.journals.map((j) => (
            <li key={j.id} className="border-rule border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{j.kind}</span>
                <span className="text-ink-muted text-xs">
                  {formatIST(j.postedAt)} · {j.referenceType} {j.referenceId.slice(0, 8)}
                </span>
              </div>
              <div className="relative mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Entries for journal {j.kind}</caption>
                  <tbody className="font-mono">
                    {j.entries.map((e, i) => (
                      <tr key={i}>
                        <td className={e.creditPaise !== "0" ? "pl-6" : ""}>{e.account}</td>
                        <td className="text-right">{e.debitPaise !== "0" ? formatINR(paise(e.debitPaise)) : ""}</td>
                        <td className="text-right">{e.creditPaise !== "0" ? formatINR(paise(e.creditPaise)) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
        <Pager
          basePath="/admin/finance/ledger"
          params={{ domain }}
          total={l.totalJournals}
          limit={LIMIT}
          offset={offset}
        />
      </section>
    </>
  );
}
