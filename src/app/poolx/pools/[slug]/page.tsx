import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MemberProgress, PoolPrice } from "@/components/poolx/pool-card";
import { ShareLinks } from "@/components/poolx/share-links";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Breadcrumbs, Container, JsonLd, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { formatINR, paise } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { formatIST, requestNow, timeLeft } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccount } from "@/modules/core/server/auth";
import { formatBps } from "@/modules/poolx/pricing";
import { getPool } from "@/modules/poolx/server/queries";
import { POOL_STATUS_LABEL, type PoolDetail } from "@/modules/poolx/types";
import { JoinForm } from "./join-form";

/** Title/summary never change once a pool is public, so metadata can be cached. */
async function getPoolMeta(slug: string) {
  "use cache";
  cacheLife("hours");
  const pool = await getPool(slug);
  return pool ? { title: pool.title, summary: pool.summary } : null;
}

export async function generateMetadata({ params }: PageProps<"/poolx/pools/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getPoolMeta(slug);
  if (!meta) return { title: "Pool not found", robots: { index: false } };
  return pageMetadata({
    title: `${meta.title} — buying pool`,
    description: meta.summary,
    path: `/poolx/pools/${slug}`,
  });
}

export default function PoolPage({ params, searchParams }: PageProps<"/poolx/pools/[slug]">) {
  return (
    <div data-module="poolx">
      <Suspense
        fallback={
          <Container className="py-10">
            <Skeleton className="h-[32rem]" />
          </Container>
        }
      >
        <Pool params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Pool({ params, searchParams }: PageProps<"/poolx/pools/[slug]">) {
  await connection();
  const { slug } = await params;
  const pool = await getPool(slug);
  if (!pool) notFound();
  const sp = await searchParams;
  const now = await requestNow();
  const url = new URL(`/poolx/pools/${pool.slug}`, site.url).toString();
  const basisNow = pool.tierBasis === "QUANTITY" ? pool.activeQuantity : pool.activeMembers;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: pool.productName,
          description: pool.summary,
          category: pool.category?.name,
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "INR",
            price: (Number(paise(pool.currentUnitPricePaise)) / 100).toFixed(2),
            availability: pool.isJoinable ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            priceValidUntil: pool.deadlineAt.slice(0, 10),
            ...(pool.seller ? { seller: { "@type": "Organization", name: pool.seller.name } } : {}),
          },
        }}
      />
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
            { href: "/poolx/pools", label: "Pools" },
            { href: `/poolx/pools/${pool.slug}`, label: pool.title },
          ]}
        />
      </Container>

      <Container className="grid gap-12 py-10 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {pool.category ? (
              <Link
                href={`/poolx/categories/${pool.category.slug}`}
                className="text-ink-muted font-mono text-xs tracking-[0.15em] uppercase hover:underline"
              >
                {pool.category.name}
              </Link>
            ) : null}
            <Badge tone={pool.status === "ACTIVE" ? "success" : "neutral"}>{POOL_STATUS_LABEL[pool.status]}</Badge>
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl">{pool.title}</h1>
          <p className="text-ink-muted mt-3 text-lg">{pool.summary}</p>

          <section aria-labelledby="about" className="mt-10">
            <h2 id="about" className="text-2xl">
              {pool.productName}
            </h2>
            {pool.description ? <p className="mt-3 whitespace-pre-line">{pool.description}</p> : null}
            {pool.specs.length > 0 ? (
              <dl className="divide-rule border-rule mt-6 divide-y border-y text-sm">
                {pool.specs.map((s) => (
                  <div key={s.label} className="grid grid-cols-[10rem_1fr] gap-4 py-2">
                    <dt className="text-ink-muted">{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section aria-labelledby="tiers" className="mt-10">
            <h2 id="tiers" className="text-2xl">
              Price tiers
            </h2>
            <p className="text-ink-muted mt-2 text-sm">
              Based on {pool.tierBasis === "QUANTITY" ? `total ${pool.unitLabel}s` : "confirmed members"}. Base price{" "}
              {formatINR(paise(pool.baseUnitPricePaise))} per {pool.unitLabel}.
            </p>
            {pool.tiers.length === 0 ? (
              <p className="mt-4 text-sm">This pool has a single price — no discount tiers.</p>
            ) : (
              <table className="mt-4 w-full text-left text-sm">
                <caption className="sr-only">Discount tiers for {pool.title}</caption>
                <thead className="text-ink-muted font-mono text-xs tracking-wide uppercase">
                  <tr>
                    <th scope="col" className="py-2 font-normal">
                      {pool.tierBasis === "QUANTITY" ? "Units" : "Members"}
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      Discount
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      Unit price
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {pool.tiers.map((t) => {
                    const reached = basisNow >= t.threshold;
                    const current = t.discountBps === pool.currentDiscountBps;
                    return (
                      <tr key={t.threshold} className={`border-rule border-t ${current ? "bg-accent/10" : ""}`}>
                        <td className="py-2">
                          {t.threshold}+ {current ? <span className="sr-only">(current tier)</span> : null}
                        </td>
                        <td className="py-2">{formatBps(t.discountBps)}</td>
                        <td className="py-2 text-right">
                          {formatINR(paise(t.unitPricePaise))} {reached ? "✓" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="rules" className="mt-10 space-y-4">
            <h2 id="rules" className="text-2xl">
              Rules
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium">Minimum to proceed</dt>
                <dd className="text-ink-muted">
                  {pool.minMembers} confirmed member{pool.minMembers === 1 ? "" : "s"} by {formatIST(pool.deadlineAt)}.
                  If the minimum isn&rsquo;t reached, every contribution is refunded in full.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Withdrawing</dt>
                <dd className="text-ink-muted">{pool.withdrawalPolicy}</dd>
              </div>
              <div>
                <dt className="font-medium">Platform fee</dt>
                <dd className="text-ink-muted">
                  {pool.platformFeeBps === 0
                    ? "None for this pool."
                    : `${formatBps(pool.platformFeeBps)} of your contribution, shown before you pay.`}
                </dd>
              </div>
              {pool.deliveryNote ? (
                <div>
                  <dt className="font-medium">Delivery</dt>
                  <dd className="text-ink-muted">{pool.deliveryNote}</dd>
                </div>
              ) : null}
              {pool.terms ? (
                <div>
                  <dt className="font-medium">Pool terms</dt>
                  <dd className="text-ink-muted whitespace-pre-line">{pool.terms}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>

        <aside aria-label="Join this pool" className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-ink bg-surface border p-5">
            <PoolPrice pool={pool} size="lg" />
            {pool.referencePricePaise && pool.referencePriceSource ? (
              <p className="text-ink-muted mt-1 text-xs">Reference price source: {pool.referencePriceSource}</p>
            ) : null}
            <div className="mt-5">
              <MemberProgress pool={pool} />
            </div>
            <p className="mt-4 text-sm">
              {pool.status === "ACTIVE" ? (
                <>
                  <strong>{timeLeft(pool.deadlineAt, now)}</strong> · closes {formatIST(pool.deadlineAt)}
                </>
              ) : pool.finalUnitPricePaise ? (
                <>
                  Deal locked at <strong className="font-mono">{formatINR(paise(pool.finalUnitPricePaise))}</strong> per{" "}
                  {pool.unitLabel}.
                </>
              ) : (
                "This pool is no longer accepting members."
              )}
            </p>
            {pool.seller ? (
              <p className="mt-2 flex items-center gap-1 text-sm">
                Seller: {pool.seller.name}
                {pool.seller.verified ? (
                  <span className="text-success inline-flex items-center gap-1">
                    <BadgeCheck aria-hidden="true" className="size-4" /> Verified
                  </span>
                ) : null}
              </p>
            ) : null}
            <div className="mt-6">
              <Suspense fallback={<Skeleton className="h-40" />}>
                <JoinPanel
                  pool={pool}
                  payment={typeof sp.payment === "string" ? sp.payment : undefined}
                  notice={typeof sp.notice === "string" ? sp.notice : undefined}
                />
              </Suspense>
            </div>
          </div>
          <div className="mt-4">
            <ShareLinks url={url} title={pool.title} />
          </div>
        </aside>
      </Container>
    </>
  );
}

type Membership = {
  status: "PENDING_PAYMENT" | "ACTIVE" | "WITHDRAWN" | "REMOVED" | "FULFILLED";
  quantity: number;
  contribution: { status: string; amountPaise: string } | null;
} | null;

async function JoinPanel({ pool, payment, notice }: { pool: PoolDetail; payment?: string; notice?: string }) {
  const account = await getAccount();
  if (!account) {
    return pool.isJoinable ? (
      <ButtonLink
        href={`/login?next=${encodeURIComponent(`/poolx/pools/${pool.slug}`)}`}
        variant="accent"
        className="w-full"
      >
        Sign in to join
      </ButtonLink>
    ) : null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_my_membership", { p_pool: pool.id });
  const membership = data as Membership;

  const banner = (tone: "success" | "danger" | "info", text: string) => (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`mb-4 border-l-4 px-3 py-2 text-sm ${tone === "success" ? "border-success bg-success/5" : tone === "danger" ? "border-danger bg-danger/5" : "border-info bg-info/5"}`}
    >
      {text}
    </p>
  );

  if (membership?.status === "ACTIVE") {
    return (
      <>
        {payment === "success" ? banner("success", "Payment confirmed — you’re in the pool.") : null}
        {notice === "already-member" ? banner("info", "You’re already in this pool.") : null}
        <p className="text-sm">
          You&rsquo;re a member with <strong>{membership.quantity}</strong> {pool.unitLabel}
          {membership.quantity === 1 ? "" : "s"}
          {membership.contribution ? (
            <>
              {" "}
              · contributed <span className="font-mono">{formatINR(paise(membership.contribution.amountPaise))}</span>
            </>
          ) : null}
          .
        </p>
        <Link href="/account/poolx" className="mt-3 inline-block text-sm underline underline-offset-4">
          Manage in My PoolX activities
        </Link>
      </>
    );
  }

  if (!pool.isJoinable) return <p className="text-sm">Joining is closed.</p>;

  const pending = membership?.status === "PENDING_PAYMENT" && membership.contribution?.status === "PENDING";
  return (
    <>
      {payment === "failed" ? banner("danger", "The payment didn’t go through. You can try again.") : null}
      {payment === "success"
        ? banner("info", "We’re waiting for the payment provider to confirm your payment. Refresh in a moment.")
        : null}
      {pending ? banner("info", "You have a payment in progress for this pool.") : null}
      <JoinForm
        poolId={pool.id}
        slug={pool.slug}
        minQty={pool.minQtyPerMember}
        maxQty={pool.maxQtyPerMember}
        unitLabel={pool.unitLabel}
        unitPricePaise={pool.currentUnitPricePaise}
        feeBps={pool.platformFeeBps}
        resume={pending}
        defaultQty={membership?.quantity}
      />
    </>
  );
}
