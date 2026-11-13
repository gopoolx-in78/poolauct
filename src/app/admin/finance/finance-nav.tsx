import Link from "next/link";

const TABS = [
  { href: "/admin/finance/payments", label: "Payments" },
  { href: "/admin/finance/refunds", label: "Refunds" },
  { href: "/admin/finance/ledger", label: "Ledger" },
  { href: "/admin/finance/exports", label: "Exports" },
];

export function FinanceNav({ current }: { current: string }) {
  return (
    <nav aria-label="Finance sections" className="border-rule mt-4 flex flex-wrap gap-4 border-b text-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px border-b-2 py-2 ${t.href === current ? "border-ink font-medium" : "text-ink-muted hover:text-ink border-transparent"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const DOMAINS = ["poolx", "auction"] as const;
export const DOMAIN_LABEL: Record<(typeof DOMAINS)[number], string> = { poolx: "PoolX", auction: "Auctions" };
