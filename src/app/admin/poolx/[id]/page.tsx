import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { POOL_STATUS_LABEL, type PoolDetail } from "@/modules/poolx/types";
import { publishPoolAction } from "../actions";
import { loadFormOptions, poolToValues } from "../form-data";
import { PoolForm } from "../pool-form";
import { CancelPoolForm, SellerForm, TiersForm } from "./forms";

export const metadata = { title: "Edit pool" };

type AdminPool = PoolDetail & {
  sellerId: string | null;
  closeReason: string | null;
  pendingMembers: number;
  refundsOpen: number;
};

export default function AdminPoolPage({ params, searchParams }: PageProps<"/admin/poolx/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[48rem]" />}>
      <AdminPool params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminPool({ params, searchParams }: PageProps<"/admin/poolx/[id]">) {
  const { id } = await params;
  await requireStaff(`/admin/poolx/${id}`, "poolx.pools.manage");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_admin_get_pool", { p_pool: id });
  const pool = data as AdminPool | null;
  if (!pool) notFound();
  const sp = await searchParams;
  const isDraft = pool.status === "DRAFT";
  const { categories, sellers } = isDraft ? await loadFormOptions() : { categories: [], sellers: [] };

  return (
    <div className="max-w-4xl space-y-12">
      <div>
        <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
          <Link href="/admin/poolx" className="hover:underline">
            PoolX
          </Link>{" "}
          / {pool.slug}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">{pool.title}</h1>
          <Badge tone={pool.status === "ACTIVE" ? "success" : isDraft ? "warning" : "neutral"}>
            {POOL_STATUS_LABEL[pool.status]}
          </Badge>
        </div>
        {sp.notice === "saved" ? (
          <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-2 text-sm">
            Saved.
          </p>
        ) : null}
        {sp.notice === "published" ? (
          <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-2 text-sm">
            Published — the pool is now open.
          </p>
        ) : null}
        {typeof sp.error === "string" ? (
          <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-2 text-sm">
            {sp.error}
          </p>
        ) : null}
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink-muted">Confirmed members</dt>
            <dd className="font-mono text-lg">
              {pool.activeMembers}/{pool.targetMembers}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Pending payments</dt>
            <dd className="font-mono text-lg">{pool.pendingMembers}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Price now</dt>
            <dd className="font-mono text-lg">{formatINR(paise(pool.currentUnitPricePaise))}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Open refunds</dt>
            <dd className="font-mono text-lg">{pool.refundsOpen}</dd>
          </div>
        </dl>
        <p className="text-ink-muted mt-3 text-sm">
          Deadline {formatIST(pool.deadlineAt)}
          {pool.closeReason ? ` · Closed: ${pool.closeReason}` : ""}
        </p>
        {!isDraft ? (
          <p className="mt-3 text-sm">
            <Link href={`/poolx/pools/${pool.slug}`} className="underline underline-offset-4">
              View public page
            </Link>
          </p>
        ) : null}
      </div>

      {isDraft ? (
        <>
          <section aria-labelledby="details-h">
            <h2 id="details-h" className="text-2xl">
              Details
            </h2>
            <div className="mt-6">
              <PoolForm poolId={pool.id} initial={poolToValues(pool)} categories={categories} sellers={sellers} />
            </div>
            <div className="mt-6">
              <SellerForm />
            </div>
          </section>
          <section aria-labelledby="tiers-h">
            <h2 id="tiers-h" className="text-2xl">
              Discount tiers
            </h2>
            <p className="text-ink-muted mt-1 text-sm">
              Based on {pool.tierBasis === "QUANTITY" ? "total quantity" : "confirmed members"}. Each higher threshold
              needs a bigger discount. Leave empty for a single price.
            </p>
            <div className="mt-4">
              <TiersForm
                poolId={pool.id}
                tiers={pool.tiers.map((t) => ({ threshold: t.threshold, discountBps: t.discountBps }))}
              />
            </div>
          </section>
          <section aria-labelledby="publish-h" className="border-ink border-t pt-6">
            <h2 id="publish-h" className="text-2xl">
              Publish
            </h2>
            <p className="text-ink-muted mt-1 text-sm">
              Publishing opens the pool to members. Prices, tiers and rules are frozen once published.
            </p>
            <form action={publishPoolAction} className="mt-4">
              <input type="hidden" name="poolId" value={pool.id} />
              <Button type="submit">Publish pool</Button>
            </form>
          </section>
        </>
      ) : (
        <section aria-labelledby="tiers-ro">
          <h2 id="tiers-ro" className="text-2xl">
            Tiers
          </h2>
          <ul className="mt-3 font-mono text-sm">
            {pool.tiers.length === 0 ? (
              <li>Single price</li>
            ) : (
              pool.tiers.map((t) => (
                <li key={t.threshold}>
                  {t.threshold}+ → {(t.discountBps / 100).toString()}% ({formatINR(paise(t.unitPricePaise))})
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {["DRAFT", "ACTIVE", "THRESHOLD_MET", "NEGOTIATING"].includes(pool.status) ? (
        <section aria-labelledby="cancel-h" className="border-danger border-t pt-6">
          <h2 id="cancel-h" className="text-2xl">
            Cancel pool
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            Every confirmed contribution is refunded in full. Pending payments are cancelled. This can&rsquo;t be
            undone.
          </p>
          <div className="mt-4">
            <CancelPoolForm poolId={pool.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
