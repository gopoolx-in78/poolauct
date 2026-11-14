import Link from "next/link";
import { Suspense } from "react";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { Stat } from "./admin-kit";

export const metadata = { title: "Dashboard" };

type Counts = Record<string, number>;
type Metrics = {
  users: {
    total: number;
    active: number;
    suspended: number;
    deletionRequested: number;
    new7d: number;
    staff: number;
  } | null;
  poolx: {
    activePools: number;
    poolsByStatus: Counts;
    activeMembers: number;
    openRequests: number;
    ordersByStatus: Counts;
    openDisputes: number;
    refundsPending: number;
    refundsFailed: number;
    capturedPaise: string | null;
    contributionLiabilityPaise: string | null;
    sellerPayablePaise: string | null;
    feeRevenuePaise: string | null;
  };
  auction: {
    live: number;
    auctionsByStatus: Counts;
    bids7d: number;
    depositsPaid: number;
    refundsPending: number;
    refundsFailed: number;
    invoicesByStatus: Counts;
    openDefaultReviews: number;
    capturedPaise: string | null;
    depositLiabilityPaise: string | null;
    buyerReceivablePaise: string | null;
    sellerPayablePaise: string | null;
  };
};

const money = (v: string | null) => (v === null ? null : formatINR(paise(v)));
const sum = (c: Counts, keys: string[]) => keys.reduce((n, k) => n + (c[k] ?? 0), 0);

export default function AdminHomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const account = await requireStaff("/admin", "admin.dashboard.view");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("admin_metrics");
  const m = data as Metrics | null;
  const has = (...perms: string[]) => perms.some((p) => account.permissions.includes(p));
  const groups = [
    {
      title: "People",
      links: [
        { href: "/admin/users", label: "Users", show: has("users.read") },
        { href: "/admin/roles", label: "Roles & permissions", show: has("roles.manage") },
        { href: "/admin/sellers", label: "Sellers", show: has("sellers.manage") },
        { href: "/admin/notifications", label: "Notification deliveries", show: has("support.tickets") },
      ],
    },
    {
      title: "PoolX",
      links: [
        { href: "/admin/poolx", label: "Pools", show: has("poolx.pools.manage") },
        { href: "/admin/poolx/requests", label: "Pool requests", show: has("poolx.requests.review") },
        { href: "/admin/poolx/disputes", label: "Disputes", show: has("poolx.orders.manage", "poolx.refunds.manual") },
      ],
    },
    {
      title: "Auctions",
      links: [
        { href: "/admin/auctions", label: "Auctions", show: has("auction.listings.manage") },
        { href: "/admin/auctions/deposits", label: "Deposits", show: has("auction.deposit.read") },
        { href: "/admin/auctions/defaults", label: "Winner defaults", show: has("auction.default.review") },
        { href: "/admin/auctions/policy", label: "Deposit policy", show: has("auction.deposit.config") },
      ],
    },
    {
      title: "Design & content",
      links: [
        { href: "/admin/theme", label: "Theme & homepage", show: has("cms.theme.edit", "cms.theme.publish") },
        { href: "/admin/content?kind=PAGE", label: "Pages", show: has("cms.content.manage") },
        { href: "/admin/content?kind=POST", label: "Blog posts", show: has("cms.content.manage") },
        { href: "/admin/content/faqs", label: "FAQs", show: has("cms.content.manage") },
        { href: "/admin/content/featured", label: "Featured listings", show: has("cms.content.manage") },
        { href: "/admin/seo", label: "SEO", show: has("seo.manage") },
      ],
    },
    {
      title: "Finance & audit",
      links: [
        { href: "/admin/finance/payments", label: "Payments", show: has("finance.ledger.read") },
        { href: "/admin/finance/refunds", label: "Refunds", show: has("finance.ledger.read") },
        { href: "/admin/finance/ledger", label: "Ledger", show: has("finance.ledger.read") },
        { href: "/admin/finance/exports", label: "Exports", show: has("finance.reports.export") },
        { href: "/admin/audit", label: "Audit log", show: has("audit.read") },
      ],
    },
  ]
    .map((g) => ({ ...g, links: g.links.filter((l) => l.show) }))
    .filter((g) => g.links.length > 0);

  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">Admin · MFA verified</p>
      <h1 className="mt-2 text-4xl">Dashboard</h1>
      <p className="text-ink-muted mt-3 max-w-2xl">
        Signed in as {account.email}. PoolX and Auction figures are kept separate and never added together; money
        figures appear only for finance roles.
      </p>

      {groups.length > 0 ? (
        <nav aria-labelledby="modules-h" className="mt-8">
          <h2 id="modules-h" className="sr-only">
            Modules
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((g) => (
              <div key={g.title}>
                <h3 className="text-ink-muted font-sans text-xs font-medium tracking-wide uppercase">{g.title}</h3>
                <ul className="mt-2 space-y-1">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="font-medium underline-offset-4 hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      ) : null}

      {m ? (
        <>
          {m.users ? (
            <section aria-labelledby="m-users" className="mt-10">
              <h2 id="m-users" className="text-2xl">
                Users
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Total" value={m.users.total} />
                <Stat label="Active" value={m.users.active} />
                <Stat label="Suspended" value={m.users.suspended} />
                <Stat label="Deletion requested" value={m.users.deletionRequested} />
                <Stat label="New (7 days)" value={m.users.new7d} />
                <Stat label="Staff" value={m.users.staff} />
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="m-poolx" className="mt-10">
            <h2 id="m-poolx" className="text-2xl">
              PoolX
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Open pools"
                value={m.poolx.activePools}
                sub={`${sum(m.poolx.poolsByStatus, ["DRAFT"])} drafts`}
              />
              <Stat label="Confirmed members" value={m.poolx.activeMembers} />
              <Stat label="Open requests" value={m.poolx.openRequests} />
              <Stat
                label="Orders in progress"
                value={sum(m.poolx.ordersByStatus, ["CREATED", "SHIPPED"])}
                sub={`${sum(m.poolx.ordersByStatus, ["DELIVERED"])} delivered`}
              />
              <Stat label="Open disputes" value={m.poolx.openDisputes} />
              <Stat label="Refunds pending" value={m.poolx.refundsPending} sub={`${m.poolx.refundsFailed} failed`} />
              {m.poolx.capturedPaise !== null ? (
                <>
                  <Stat label="Captured (all time)" value={money(m.poolx.capturedPaise)} />
                  <Stat label="Contributions held" value={money(m.poolx.contributionLiabilityPaise)} />
                  <Stat label="Owed to sellers" value={money(m.poolx.sellerPayablePaise)} />
                  <Stat label="Platform fee revenue" value={money(m.poolx.feeRevenuePaise)} />
                </>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby="m-auction" className="mt-10">
            <h2 id="m-auction" className="text-2xl">
              Auctions
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Live now"
                value={m.auction.live}
                sub={`${sum(m.auction.auctionsByStatus, ["SCHEDULED"])} upcoming`}
              />
              <Stat label="Bids (7 days)" value={m.auction.bids7d} />
              <Stat label="Deposits paid, held" value={m.auction.depositsPaid} />
              <Stat
                label="Refunds pending"
                value={m.auction.refundsPending}
                sub={`${m.auction.refundsFailed} failed`}
              />
              <Stat
                label="Invoices awaiting payment"
                value={sum(m.auction.invoicesByStatus, ["ISSUED"])}
                sub={`${sum(m.auction.invoicesByStatus, ["PAID"])} paid`}
              />
              <Stat label="Open default reviews" value={m.auction.openDefaultReviews} />
              {m.auction.capturedPaise !== null ? (
                <>
                  <Stat label="Captured (all time)" value={money(m.auction.capturedPaise)} />
                  <Stat label="Deposits held (liability)" value={money(m.auction.depositLiabilityPaise)} />
                  <Stat label="Due from winners" value={money(m.auction.buyerReceivablePaise)} />
                  <Stat label="Owed to sellers" value={money(m.auction.sellerPayablePaise)} />
                </>
              ) : null}
            </dl>
          </section>
        </>
      ) : (
        <p role="alert" className="mt-8">
          Metrics could not be loaded.
        </p>
      )}

      <section aria-labelledby="roles" className="mt-10">
        <h2 id="roles" className="text-2xl">
          Your roles
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {account.roles.map((r) => (
            <li key={r}>
              <Badge>{r.replaceAll("_", " ")}</Badge>
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm">Effective permissions ({account.permissions.length})</summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[...account.permissions].sort().map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
