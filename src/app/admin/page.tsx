import Link from "next/link";
import { Suspense } from "react";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { requireStaff } from "@/modules/core/server/auth";

export const metadata = { title: "Dashboard" };

export default function AdminHomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const account = await requireStaff("/admin", "admin.dashboard.view");
  const has = (...perms: string[]) => perms.some((p) => account.permissions.includes(p));
  const modules = [
    { href: "/admin/poolx", label: "PoolX pools", show: has("poolx.pools.manage") },
    {
      href: "/admin/poolx/disputes",
      label: "PoolX disputes",
      show: has("poolx.orders.manage", "poolx.refunds.manual"),
    },
    { href: "/admin/poolx/requests", label: "Pool requests", show: has("poolx.requests.review") },
    { href: "/admin/auctions", label: "Auctions", show: has("auction.listings.manage") },
    { href: "/admin/auctions/deposits", label: "Auction deposits", show: has("auction.deposit.read") },
    { href: "/admin/auctions/defaults", label: "Winner defaults", show: has("auction.default.review") },
    { href: "/admin/auctions/policy", label: "Deposit policy", show: has("auction.deposit.config") },
  ].filter((m) => m.show);
  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">Admin · MFA verified</p>
      <h1 className="mt-2 text-4xl">Dashboard</h1>
      <p className="text-ink-muted mt-3 max-w-2xl">
        Signed in as {account.email}. Finance, user and content management modules are added here in later phases; each
        is limited to the permissions below.
      </p>
      {modules.length > 0 ? (
        <nav aria-label="Admin modules" className="mt-8">
          <ul className="flex flex-wrap gap-3">
            {modules.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="border-ink hover:bg-ink/5 inline-block border px-4 py-2 font-medium">
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
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
      </section>
      <section aria-labelledby="perms" className="mt-8">
        <h2 id="perms" className="text-2xl">
          Effective permissions ({account.permissions.length})
        </h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[...account.permissions].sort().map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
