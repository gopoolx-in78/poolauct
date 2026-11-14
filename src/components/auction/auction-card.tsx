import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { CoverImage } from "@/components/media/gallery";
import { Badge } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST, timeLeft } from "@/lib/time";
import { AUCTION_STATUS_LABEL, CONDITION_LABEL, type AuctionSummary } from "@/modules/auction/types";

export function AuctionPrice({ a, size = "md" }: { a: AuctionSummary; size?: "md" | "lg" }) {
  const hasBid = a.currentBidPaise !== null;
  return (
    <div>
      <p className="text-ink-muted text-xs tracking-wide uppercase">{hasBid ? "Current bid" : "Starting bid"}</p>
      <p className={`font-mono tabular-nums ${size === "lg" ? "text-4xl" : "text-2xl"}`}>
        {formatINR(paise(hasBid ? a.currentBidPaise! : a.startingPricePaise))}
      </p>
    </div>
  );
}

export function AuctionCard({ a, now }: { a: AuctionSummary; now: number }) {
  const when =
    a.status === "SCHEDULED"
      ? `Starts ${formatIST(a.startsAt)}`
      : a.status === "LIVE"
        ? timeLeft(a.endsAt, now)
        : AUCTION_STATUS_LABEL[a.status];
  return (
    <article className="bg-surface border-rule flex flex-col overflow-hidden border p-5" data-module="auction">
      {a.cover ? <CoverImage media={a.cover} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-muted font-mono text-xs tracking-[0.15em] uppercase">{a.category?.name}</span>
        <Badge tone={a.status === "LIVE" ? "accent" : "neutral"}>{AUCTION_STATUS_LABEL[a.status]}</Badge>
      </div>
      <h3 className="mt-3 text-2xl">
        <Link href={`/auctions/${a.slug}`} className="hover:underline hover:underline-offset-4">
          {a.title}
        </Link>
      </h3>
      <p className="text-ink-muted mt-1 text-sm">
        {[a.year, CONDITION_LABEL[a.condition], a.location].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <AuctionPrice a={a} />
        <p className="text-right text-sm">
          <span className="block font-mono">{a.bidCount}</span>
          <span className="text-ink-muted">bid{a.bidCount === 1 ? "" : "s"}</span>
        </p>
      </div>
      <dl className="border-rule mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
        <div>
          <dt className="text-ink-muted text-xs">Deposit to bid</dt>
          <dd className="font-mono">{a.depositAmountPaise ? formatINR(paise(a.depositAmountPaise)) : "—"}</dd>
        </div>
        <div className="text-right">
          <dt className="text-ink-muted text-xs">{a.status === "LIVE" ? "Ends" : "Timing"}</dt>
          <dd>{when}</dd>
        </div>
      </dl>
      {a.seller?.verified ? (
        <p className="text-success mt-3 inline-flex items-center gap-1 text-sm">
          <BadgeCheck aria-hidden="true" className="size-4" /> Verified seller
        </p>
      ) : null}
      <Link
        href={`/auctions/${a.slug}`}
        className="bg-accent text-accent-ink hover:bg-accent/85 mt-5 inline-flex h-11 items-center justify-center rounded px-5 font-medium"
        aria-label={`View auction: ${a.title}`}
      >
        {a.status === "LIVE" ? "View & bid" : "View auction"}
      </Link>
    </article>
  );
}
