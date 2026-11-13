import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requestNow } from "@/lib/time";
import { requireStaff } from "@/modules/core/server/auth";
import { emptyPoolValues, loadFormOptions } from "../form-data";
import { PoolForm } from "../pool-form";

export const metadata = { title: "New pool" };

export default function NewPoolPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[48rem]" />}>
      <NewPool />
    </Suspense>
  );
}

async function NewPool() {
  await requireStaff("/admin/poolx/new", "poolx.pools.manage");
  const [{ categories, sellers }, now] = await Promise.all([loadFormOptions(), requestNow()]);
  return (
    <div className="max-w-4xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/poolx" className="hover:underline">
          PoolX
        </Link>{" "}
        / New
      </p>
      <h1 className="mt-2 text-4xl">New pool</h1>
      <p className="text-ink-muted mt-2">Pools are created as drafts. Add tiers, check the details, then publish.</p>
      <div className="mt-8">
        <PoolForm initial={emptyPoolValues(new Date(now).toISOString())} categories={categories} sellers={sellers} />
      </div>
    </div>
  );
}
