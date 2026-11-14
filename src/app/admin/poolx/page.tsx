import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { POOL_STATUS_LABEL, type PoolSummary } from "@/modules/poolx/types";

export const metadata = { title: "PoolX pools" };

export default function AdminPoolsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Pools />
    </Suspense>
  );
}

async function Pools() {
  await requireStaff("/admin/poolx", "poolx.pools.manage");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_admin_list_pools");
  const pools = (data ?? []) as PoolSummary[];
  return (
    <>
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>{" "}
        / PoolX
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">PoolX pools</h1>
        <div className="flex gap-3">
          <ButtonLink href="/admin/poolx/requests" variant="secondary">
            Requests
          </ButtonLink>
          <ButtonLink href="/admin/poolx/new">New pool</ButtonLink>
        </div>
      </div>
      {pools.length === 0 ? (
        <EmptyState className="mt-8" title="No pools yet" />
      ) : (
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">All PoolX pools</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Pool
                </th>
                <th scope="col">Status</th>
                <th scope="col">Members</th>
                <th scope="col">Price now</th>
                <th scope="col">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id} className="border-rule border-t">
                  <td className="py-3">
                    <Link href={`/admin/poolx/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-ink-muted text-xs">/{p.slug}</div>
                  </td>
                  <td>
                    <Badge tone={p.status === "ACTIVE" ? "success" : p.status === "DRAFT" ? "warning" : "neutral"}>
                      {POOL_STATUS_LABEL[p.status]}
                    </Badge>
                  </td>
                  <td className="font-mono">
                    {p.activeMembers}/{p.targetMembers}
                  </td>
                  <td className="font-mono">{formatINR(paise(p.currentUnitPricePaise))}</td>
                  <td>{formatIST(p.deadlineAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
