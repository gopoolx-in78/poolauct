import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Badge, Progress } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { timeLeft } from "@/lib/time";
import { formatBps } from "@/modules/poolx/pricing";
import { POOL_STATUS_LABEL, type PoolSummary } from "@/modules/poolx/types";

export function PoolPrice({ pool, size = "md" }: { pool: PoolSummary; size?: "md" | "lg" }) {
  const current = paise(pool.currentUnitPricePaise);
  const reference = pool.referencePricePaise ? paise(pool.referencePricePaise) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`font-mono tabular-nums ${size === "lg" ? "text-4xl" : "text-2xl"}`}>{formatINR(current)}</span>
      <span className="text-ink-muted text-sm">per {pool.unitLabel}</span>
      {reference && reference > current ? (
        <span className="text-ink-muted text-sm">
          <span className="sr-only">Reference price </span>
          <s className="font-mono">{formatINR(reference)}</s>
          {pool.referencePriceSource ? <span className="sr-only"> ({pool.referencePriceSource})</span> : null}
        </span>
      ) : null}
      {pool.currentDiscountBps > 0 ? <Badge tone="accent">{formatBps(pool.currentDiscountBps)} off</Badge> : null}
    </div>
  );
}

export function MemberProgress({ pool }: { pool: PoolSummary }) {
  const basisNow = pool.tierBasis === "QUANTITY" ? pool.activeQuantity : pool.activeMembers;
  const noun = pool.tierBasis === "QUANTITY" ? pool.unitLabel + "s" : "members";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>
          <strong className="font-mono">{pool.activeMembers}</strong>
          <span className="text-ink-muted"> / {pool.targetMembers} members</span>
        </span>
        {pool.nextTier ? (
          <span className="text-ink-muted">
            Next: {formatBps(pool.nextTier.discountBps)} at {pool.nextTier.threshold} {noun}
            {basisNow < pool.nextTier.threshold ? ` (${pool.nextTier.threshold - basisNow} to go)` : ""}
          </span>
        ) : null}
      </div>
      <Progress
        className="mt-2"
        value={pool.activeMembers}
        max={pool.targetMembers}
        label={`${pool.activeMembers} of ${pool.targetMembers} target members`}
      />
    </div>
  );
}

export function PoolCard({ pool, now }: { pool: PoolSummary; now: number }) {
  return (
    <article className="bg-surface border-rule flex flex-col border p-5" data-module="poolx">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-muted font-mono text-xs tracking-[0.15em] uppercase">{pool.category?.name}</span>
        <Badge tone={pool.status === "ACTIVE" ? "success" : "neutral"}>{POOL_STATUS_LABEL[pool.status]}</Badge>
      </div>
      <h3 className="mt-3 text-2xl">
        <Link href={`/poolx/pools/${pool.slug}`} className="hover:underline hover:underline-offset-4">
          {pool.title}
        </Link>
      </h3>
      <p className="text-ink-muted mt-1 text-sm">{pool.summary}</p>
      <div className="mt-4">
        <PoolPrice pool={pool} />
      </div>
      <div className="mt-4">
        <MemberProgress pool={pool} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-muted">
          {pool.status === "ACTIVE" ? timeLeft(pool.deadlineAt, now) : "Closed to new members"}
        </span>
        {pool.seller?.verified ? (
          <span className="text-success inline-flex items-center gap-1">
            <BadgeCheck aria-hidden="true" className="size-4" /> Verified seller
          </span>
        ) : null}
      </div>
      <Link
        href={`/poolx/pools/${pool.slug}`}
        className="bg-accent text-accent-ink hover:bg-accent/85 mt-5 inline-flex h-11 items-center justify-center rounded px-5 font-medium"
        aria-label={`${pool.isJoinable ? "View and join" : "View"} ${pool.title}`}
      >
        {pool.isJoinable ? "View & join" : "View pool"}
      </Link>
    </article>
  );
}
