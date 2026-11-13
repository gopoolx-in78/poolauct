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
  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">Admin · MFA verified</p>
      <h1 className="mt-2 text-4xl">Dashboard</h1>
      <p className="text-ink-muted mt-3 max-w-2xl">
        Signed in as {account.email}. PoolX, auction, finance, user and content management modules are added here in
        later phases; each is limited to the permissions below.
      </p>
      {account.permissions.includes("poolx.pools.manage") || account.permissions.includes("poolx.requests.review") ? (
        <nav aria-label="Admin modules" className="mt-8">
          <ul className="flex flex-wrap gap-3">
            {account.permissions.includes("poolx.pools.manage") ? (
              <li>
                <Link
                  href="/admin/poolx"
                  className="border-ink hover:bg-ink/5 inline-block border px-4 py-2 font-medium"
                >
                  PoolX pools
                </Link>
              </li>
            ) : null}
            {account.permissions.includes("poolx.requests.review") ? (
              <li>
                <Link
                  href="/admin/poolx/requests"
                  className="border-ink hover:bg-ink/5 inline-block border px-4 py-2 font-medium"
                >
                  Pool requests
                </Link>
              </li>
            ) : null}
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
