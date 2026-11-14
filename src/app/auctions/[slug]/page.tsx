import { randomUUID } from "node:crypto";
import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuctionPrice } from "@/components/auction/auction-card";
import { Countdown } from "@/components/auction/countdown";
import { LiveRefresh } from "@/components/auction/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Breadcrumbs, Container, JsonLd, Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { formatINR, paise } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { formatIST, requestNow, timeLeft } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccount } from "@/modules/core/server/auth";
import { Gallery } from "@/components/media/gallery";
import { getAuction, getAuctionMedia, getBidHistory } from "@/modules/auction/server/queries";
import {
  AUCTION_STATUS_LABEL,
  CONDITION_LABEL,
  DEPOSIT_LABEL,
  type AuctionDetail,
  type MyAuctionStatus,
} from "@/modules/auction/types";
import { BidForm, DepositForm } from "./participate";

async function getMeta(slug: string) {
  "use cache";
  cacheLife("hours");
  const a = await getAuction(slug);
  return a ? { title: a.title, location: a.location, category: a.category?.name ?? "Auction" } : null;
}

export async function generateMetadata({ params }: PageProps<"/auctions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMeta(slug);
  if (!m) return { title: "Auction not found", robots: { index: false } };
  return pageMetadata({
    title: `${m.title} — online auction`,
    description: `${m.category} auction in ${m.location}. See condition, inspection details, the refundable deposit and current bids.`,
    path: `/auctions/${slug}`,
  });
}

export default function AuctionPage(props: PageProps<"/auctions/[slug]">) {
  return (
    <div data-module="auction">
      <Suspense
        fallback={
          <Container className="py-10">
            <Skeleton className="h-[36rem]" />
          </Container>
        }
      >
        <Auction {...props} />
      </Suspense>
    </div>
  );
}

const RC_LABEL = {
  NOT_VERIFIED: "Not verified",
  MANUALLY_VERIFIED: "Verified manually by our team",
  PROVIDER_VERIFIED: "Verified via official source",
} as const;

async function Auction({ params, searchParams }: PageProps<"/auctions/[slug]">) {
  const now = await requestNow();
  const { slug } = await params;
  const a = await getAuction(slug);
  if (!a) notFound();
  const sp = await searchParams;
  const [history, media] = await Promise.all([getBidHistory(slug), getAuctionMedia(slug)]);
  const url = new URL(`/auctions/${a.slug}`, site.url).toString();
  const chargesTotal = a.charges.reduce((s, c) => s + BigInt(c.amountPaise), 0n);

  return (
    <>
      <LiveRefresh active={a.status === "LIVE"} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: a.title,
          ...(a.brand ? { brand: { "@type": "Brand", name: a.brand } } : {}),
          ...(a.model ? { model: a.model } : {}),
          itemCondition: "https://schema.org/UsedCondition",
          description: a.description.slice(0, 300),
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "INR",
            price: (Number(paise(a.currentBidPaise ?? a.startingPricePaise)) / 100).toFixed(2),
            availability:
              a.status === "LIVE" || a.status === "SCHEDULED"
                ? "https://schema.org/InStock"
                : "https://schema.org/SoldOut",
          },
        }}
      />
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/auctions", label: "Auctions" },
            ...(a.category ? [{ href: `/auctions/category/${a.category.slug}`, label: a.category.name }] : []),
            { href: `/auctions/${a.slug}`, label: a.title },
          ]}
        />
      </Container>

      <Container className="grid gap-12 py-10 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.status === "LIVE" ? "accent" : "neutral"}>{AUCTION_STATUS_LABEL[a.status]}</Badge>
            <span className="text-ink-muted text-sm">
              {[a.year, CONDITION_LABEL[a.condition], a.location].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl">{a.title}</h1>
          <Gallery items={media} title={a.title} />
          <p className="mt-6 whitespace-pre-line">{a.description}</p>

          {a.vehicle ? (
            <section aria-labelledby="vehicle-h" className="mt-10">
              <h2 id="vehicle-h" className="text-2xl">
                Vehicle details
              </h2>
              <dl className="divide-rule border-rule mt-4 divide-y border-y text-sm">
                {[
                  ["Make / variant", [a.vehicle.manufacturer, a.model, a.vehicle.variant].filter(Boolean).join(" ")],
                  [
                    "Registration",
                    `${a.vehicle.registrationMasked} (${a.vehicle.registrationState}) — full number shared with the winner`,
                  ],
                  ["RC verification", RC_LABEL[a.vehicle.rcStatus]],
                  [
                    "Fuel / transmission",
                    `${a.vehicle.fuelType.toLowerCase()} · ${a.vehicle.transmission.toLowerCase()}`,
                  ],
                  ["Odometer", `${a.vehicle.odometerKm.toLocaleString("en-IN")} km`],
                  ["Previous owners", String(a.vehicle.ownersCount)],
                  [
                    "Insurance valid until",
                    a.vehicle.insuranceValidUntil
                      ? formatIST(a.vehicle.insuranceValidUntil, { withTime: false })
                      : "Not provided",
                  ],
                  ["PUC", a.vehicle.pucStatus.replaceAll("_", " ").toLowerCase()],
                  ["Accident history (seller disclosure)", a.vehicle.accidentDisclosure],
                  ["Damage (seller disclosure)", a.vehicle.damageDisclosure],
                  ["Service history", a.vehicle.serviceHistory ?? "Not provided"],
                  ["Ownership transfer", a.vehicle.ownershipTransferTerms],
                ].map(([k, v]) => (
                  <div key={k} className="grid gap-1 py-2 sm:grid-cols-[13rem_1fr] sm:gap-4">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="inspection-h" className="mt-10">
            <h2 id="inspection-h" className="text-2xl">
              Inspection
            </h2>
            {a.inspections.length === 0 ? (
              <p className="text-ink-muted mt-2 text-sm">No inspection report has been published for this asset.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {a.inspections.map((i) => (
                  <li key={i.inspectedAt + i.inspector} className="border-rule border-l-2 pl-3">
                    <p className="font-medium">
                      {i.inspector} · {formatIST(i.inspectedAt, { withTime: false })} · {i.location}{" "}
                      {i.verified ? <Badge tone="success">Verified report</Badge> : <Badge>Unverified report</Badge>}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{i.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="terms-h" className="mt-10 space-y-4 text-sm">
            <h2 id="terms-h" className="text-2xl">
              Charges, pickup and terms
            </h2>
            <div>
              <h3 className="font-sans text-base font-medium">
                Charges payable by the winner (in addition to the winning bid)
              </h3>
              {a.charges.length === 0 ? (
                <p className="text-ink-muted">None.</p>
              ) : (
                <ul className="mt-1">
                  {a.charges.map((c) => (
                    <li key={c.label} className="flex justify-between gap-4">
                      <span>{c.label}</span>
                      <span className="font-mono">{formatINR(paise(c.amountPaise))}</span>
                    </li>
                  ))}
                  <li className="border-rule mt-1 flex justify-between gap-4 border-t pt-1 font-medium">
                    <span>Total charges</span>
                    <span className="font-mono">{formatINR(paise(chargesTotal))}</span>
                  </li>
                </ul>
              )}
              <p className="text-ink-muted mt-1">Applicable taxes, if any, are itemised on the invoice.</p>
            </div>
            <div>
              <h3 className="font-sans text-base font-medium">Pickup / delivery</h3>
              <p className="text-ink-muted whitespace-pre-line">{a.pickupTerms}</p>
            </div>
            <div>
              <h3 className="font-sans text-base font-medium">Deposit terms</h3>
              <p className="text-ink-muted whitespace-pre-line">{a.depositTerms}</p>
            </div>
            <div>
              <h3 className="font-sans text-base font-medium">Winner payment</h3>
              <p className="text-ink-muted">
                The winner pays the balance (winning bid + charges − deposit) within {a.winnerPaymentDeadlineHours}{" "}
                hours of the auction closing.
              </p>
            </div>
            {a.antiSnipe ? (
              <div>
                <h3 className="font-sans text-base font-medium">Last-minute bids</h3>
                <p className="text-ink-muted">
                  A bid in the final {Math.round(a.antiSnipe.windowSeconds / 60)} min extends the auction by{" "}
                  {Math.round(a.antiSnipe.extendSeconds / 60)} min (up to {a.antiSnipe.maxExtensions} times;{" "}
                  {a.antiSnipe.used} used).
                </p>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="history-h" className="mt-10">
            <h2 id="history-h" className="text-2xl">
              Bid history
            </h2>
            {history.length === 0 ? (
              <p className="text-ink-muted mt-2 text-sm">No bids yet.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <caption className="sr-only">Bid history (bidders are shown anonymously)</caption>
                <thead className="text-ink-muted text-xs uppercase">
                  <tr>
                    <th scope="col" className="py-1">
                      Bidder
                    </th>
                    <th scope="col">Amount</th>
                    <th scope="col">Time (IST)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {history.map((h) => (
                    <tr key={h.at + h.amountPaise} className="border-rule border-t">
                      <td className="py-1 font-sans">{h.bidder}</td>
                      <td>{formatINR(paise(h.amountPaise))}</td>
                      <td>{formatIST(h.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside aria-label="Bidding" className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-ink bg-surface border p-5">
            <AuctionPrice a={a} size="lg" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-muted text-xs">Minimum next bid</dt>
                <dd className="font-mono">{formatINR(paise(a.minNextBidPaise))}</dd>
              </div>
              <div>
                <dt className="text-ink-muted text-xs">Bids / bidders</dt>
                <dd className="font-mono">
                  {a.bidCount} / {a.bidderCount}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted text-xs">Starting bid</dt>
                <dd className="font-mono">{formatINR(paise(a.startingPricePaise))}</dd>
              </div>
              <div>
                <dt className="text-ink-muted text-xs">Reserve</dt>
                <dd>
                  {!a.reserve
                    ? "No reserve"
                    : a.reserve.disclosure === "HIDDEN"
                      ? "Reserve applies"
                      : a.reserve.met
                        ? "Reserve met"
                        : "Reserve not yet met"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm">
              {a.status === "LIVE" ? (
                <>
                  Ends in{" "}
                  <strong>
                    <Countdown to={a.endsAt} initialLabel={timeLeft(a.endsAt, now)} />
                  </strong>{" "}
                  · {formatIST(a.endsAt)}
                </>
              ) : a.status === "SCHEDULED" ? (
                <>Bidding opens {formatIST(a.startsAt)}</>
              ) : a.result ? (
                <>
                  Auction closed —{" "}
                  {a.result.outcome === "WON"
                    ? `sold for ${formatINR(paise(a.result.finalPricePaise!))}`
                    : a.result.outcome === "RESERVE_NOT_MET"
                      ? "reserve not met"
                      : a.result.outcome === "NO_BIDS"
                        ? "no bids"
                        : "cancelled"}
                  .
                </>
              ) : (
                AUCTION_STATUS_LABEL[a.status]
              )}
            </p>

            <div className="border-accent bg-accent/5 mt-5 border-l-4 p-3 text-sm">
              <p className="font-medium">
                Refundable deposit to bid:{" "}
                <span className="font-mono">{a.depositAmountPaise ? formatINR(paise(a.depositAmountPaise)) : "—"}</span>
              </p>
              <p className="text-ink-muted mt-1">
                Required for every bidder in this auction. Refunded in full if you don&rsquo;t win; credited to your
                invoice if you do.
              </p>
            </div>

            <div className="mt-5">
              <Suspense fallback={<Skeleton className="h-32" />}>
                <Participation
                  a={a}
                  bidNotice={sp.bid === "accepted"}
                  payment={typeof sp.payment === "string" ? sp.payment : undefined}
                />
              </Suspense>
            </div>
            {a.seller ? (
              <p className="mt-4 flex items-center gap-1 text-sm">
                Seller: {a.seller.name}
                {a.seller.verified ? (
                  <span className="text-success inline-flex items-center gap-1">
                    <BadgeCheck aria-hidden="true" className="size-4" /> Verified
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </aside>
      </Container>
    </>
  );
}

async function Participation({ a, bidNotice, payment }: { a: AuctionDetail; bidNotice: boolean; payment?: string }) {
  const open = a.status === "LIVE" || a.status === "SCHEDULED";
  const account = await getAccount();
  if (!account) {
    return open ? (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/auctions/${a.slug}`)}`} variant="accent" className="w-full">
        Sign in to participate
      </ButtonLink>
    ) : null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("auction_my_status", { p_auction: a.id });
  const me = data as MyAuctionStatus;
  const dep = me?.deposit;
  const note = (tone: "success" | "danger" | "info", text: string) => (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`mb-3 border-l-4 px-3 py-2 text-sm ${tone === "success" ? "border-success bg-success/5" : tone === "danger" ? "border-danger bg-danger/5" : "border-info bg-info/5"}`}
    >
      {text}
    </p>
  );

  if (me?.isSeller) return <p className="text-sm">You&rsquo;re the seller of this asset, so you can&rsquo;t bid.</p>;
  if (dep && !["CREATED", "PAYMENT_PENDING", "PAYMENT_FAILED", "PAID"].includes(dep.status)) {
    return (
      <p className="text-sm">
        Your deposit: <strong>{DEPOSIT_LABEL[dep.status]}</strong>.{" "}
        <Link href="/account/auctions" className="underline underline-offset-4">
          See My Auction Deposits
        </Link>
      </p>
    );
  }
  if (!open) return null;
  if (!me?.verified) return <p className="text-sm">Complete bidder verification before taking part.</p>;

  if (dep?.status === "PAID") {
    return (
      <>
        {payment === "success" ? note("success", "Deposit confirmed — bidding is enabled for this auction.") : null}
        {bidNotice ? note("success", "Bid accepted.") : null}
        <p className="mb-3 text-sm">
          You&rsquo;re <strong>Bidder {me.participant?.alias}</strong>.{" "}
          {me.myHighestBidPaise
            ? me.isLeading
              ? "You’re the highest bidder."
              : `Your highest bid: ${formatINR(paise(me.myHighestBidPaise))} — you’ve been outbid.`
            : "You haven’t bid yet."}
        </p>
        {a.status === "LIVE" ? (
          <BidForm
            auctionId={a.id}
            slug={a.slug}
            minNextPaise={a.minNextBidPaise}
            idempotencyKey={`bid-${randomUUID()}`}
          />
        ) : (
          <p className="text-sm">Bidding opens {formatIST(a.startsAt)}. Your deposit is ready.</p>
        )}
      </>
    );
  }

  return (
    <>
      {payment === "failed" ? note("danger", "The deposit payment didn’t go through. You can try again.") : null}
      {payment === "success"
        ? note("info", "We’re waiting for the payment provider to confirm your deposit. Refresh in a moment.")
        : null}
      {dep?.status === "PAYMENT_PENDING"
        ? note("info", "Your deposit payment is pending. Bidding opens once it’s confirmed.")
        : null}
      <DepositForm
        auctionId={a.id}
        slug={a.slug}
        termsVersion={a.termsVersion}
        depositPaise={a.depositAmountPaise!}
        resume={dep?.status === "PAYMENT_PENDING"}
      />
    </>
  );
}
