import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";

/**
 * Wording for every notification event (master prompt §15). The database stores the event key and a small data
 * object; the same text is used in the in-app inbox and in e-mails. Values come from our own database, never from
 * the browser, and are rendered as plain text (React escapes them; e-mails escape them in `email.ts`).
 */
export type NotificationData = Record<string, unknown>;
export type RenderedNotification = { title: string; body: string };

const text = (data: NotificationData, key: string, fallback = ""): string => {
  const v = data[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
};

const money = (data: NotificationData, key: string): string => {
  const v = data[key];
  if (typeof v !== "string" || !/^\d+$/.test(v)) return "the amount";
  return formatINR(paise(v));
};

const when = (data: NotificationData, key: string): string => {
  const v = text(data, key);
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? formatIST(d) : "soon";
};

const pool = (d: NotificationData) => text(d, "poolTitle", "your pool");
const auction = (d: NotificationData) => text(d, "auctionTitle", "the auction");

const POOLX_REFUND_REASONS: Record<string, string> = {
  MEMBER_WITHDRAWAL: "you withdrew from the pool",
  POOL_CANCELLED: "the pool was cancelled",
  POOL_EXPIRED: "the pool did not reach its minimum before the deadline",
  LATE_CAPTURE: "your payment arrived after the pool closed",
  PRICE_ADJUSTMENT: "the final price was lower than what you paid",
  MANUAL: "of a support decision",
};

const AUCTION_REFUND_REASONS: Record<string, string> = {
  LOST: "another bidder won",
  NO_BID: "you did not bid",
  CANCELLED: "the auction was cancelled",
  SELLER_CANCELLED: "the seller withdrew the item",
  RESERVE_NOT_MET: "the reserve price was not met",
  NO_WINNER: "the auction closed without a winner",
  LATE_CAPTURE: "your payment arrived after the auction closed",
  DUPLICATE_PAYMENT: "you paid the deposit twice",
  DEFAULT_RESOLVED: "the payment review was resolved",
  MANUAL: "of a support decision",
};

const OUTCOMES: Record<string, string> = {
  WON: "closed with a winner",
  RESERVE_NOT_MET: "closed without a sale because the reserve price was not met",
  NO_BIDS: "closed without any bids",
  CANCELLED: "was cancelled",
};

const reasonText = (map: Record<string, string>, data: NotificationData) =>
  map[text(data, "reason")] ?? "the refund rules apply";

const reference = (data: NotificationData) => {
  const ref = text(data, "reference");
  return ref ? ` Provider reference ${ref}.` : "";
};

const RENDERERS: Record<string, (d: NotificationData) => RenderedNotification> = {
  "poolx.pool_created": (d) => ({
    title: `New pool: ${pool(d)}`,
    body: `A new buying pool is open for joining. The more members join, the lower the price for everyone.`,
  }),
  "poolx.pool_approved": (d) => ({
    title: "Your pool request was approved",
    body: `Your request "${text(d, "requestTitle", "for a pool")}" was approved.${
      text(d, "poolTitle") ? ` The pool "${pool(d)}" is now available.` : " We will let you know when the pool opens."
    }`,
  }),
  "poolx.pool_joined": (d) => ({
    title: `You joined ${pool(d)}`,
    body: `Your membership is active${typeof d.quantity === "number" ? ` for ${d.quantity} unit${d.quantity === 1 ? "" : "s"}` : ""}.`,
  }),
  "poolx.contribution_confirmed": (d) => ({
    title: "Contribution confirmed",
    body: `We received your payment of ${money(d, "amountPaise")} for ${pool(d)}.`,
  }),
  "poolx.discount_milestone": (d) => {
    const bps = typeof d.discountBps === "number" ? d.discountBps : null;
    const pct = bps !== null ? `${(bps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%` : "a new";
    return {
      title: `${pool(d)} reached ${pct} off`,
      body: `Enough members joined to unlock ${pct} off. The final price is fixed when the pool is locked.`,
    };
  },
  "poolx.target_achieved": (d) => ({
    title: `${pool(d)} reached its member target`,
    body: `The pool now has ${typeof d.members === "number" ? d.members : "enough"} members. Next, the price is confirmed with the seller.`,
  }),
  "poolx.pool_completed": (d) => ({
    title: `${pool(d)} is complete`,
    body: "Every order in this pool has been delivered or resolved. Thank you for buying together.",
  }),
  "poolx.order_dispatched": (d) => ({
    title: `Your order from ${pool(d)} has shipped`,
    body: text(d, "carrier")
      ? `Shipped with ${text(d, "carrier")}${text(d, "trackingNumber") ? `, tracking number ${text(d, "trackingNumber")}` : ""}.`
      : "Your order is on its way.",
  }),
  "poolx.delivery_update": (d) => ({
    title: `Your order from ${pool(d)} was delivered`,
    body: "If anything is wrong with the delivery, you can report a problem from My PoolX activities.",
  }),
  "poolx.refund_initiated": (d) => ({
    title: "Refund started",
    body: `A refund of ${money(d, "amountPaise")} for ${pool(d)} has been started because ${reasonText(POOLX_REFUND_REASONS, d)}.`,
  }),
  "poolx.refund_completed": (d) => ({
    title: "Refund completed",
    body: `The payment provider confirmed your refund of ${money(d, "amountPaise")} for ${pool(d)}.${reference(d)}`,
  }),
  "auction.auction_approved": (d) => ({
    title: "Your listing was approved",
    body: `${auction(d)} has been published. Bidding opens ${when(d, "startsAt")}.`,
  }),
  "auction.auction_published": (d) => ({
    title: `New auction: ${auction(d)}`,
    body: `Bidding opens ${when(d, "startsAt")}. A refundable deposit is required before you can bid.`,
  }),
  "auction.auction_starting": (d) => ({
    title: `${auction(d)} starts soon`,
    body: `Bidding opens ${when(d, "startsAt")}. Your deposit is paid, so you can bid as soon as it starts.`,
  }),
  "auction.deposit_confirmed": (d) => ({
    title: "Deposit confirmed",
    body: `We received your refundable deposit of ${money(d, "amountPaise")} for ${auction(d)}. If you do not win, it is refunded in full.`,
  }),
  "auction.bidding_activated": (d) => ({
    title: `You can now bid on ${auction(d)}`,
    body: `Bidding is open until ${when(d, "endsAt")}.`,
  }),
  "auction.bid_accepted": (d) => ({
    title: "Bid accepted",
    body: `Your bid of ${money(d, "amountPaise")} on ${auction(d)} was accepted.`,
  }),
  "auction.ending_soon": (d) => ({
    title: `${auction(d)} ends soon`,
    body: `Bidding closes ${when(d, "endsAt")}. Late bids can extend the end time.`,
  }),
  "auction.outbid": (d) => ({
    title: `You were outbid on ${auction(d)}`,
    body: `The current bid is now ${money(d, "currentBidPaise")}. Bidding closes ${when(d, "endsAt")}.`,
  }),
  "auction.auction_closed": (d) => ({
    title: `${auction(d)} has closed`,
    body: `The auction ${OUTCOMES[text(d, "outcome")] ?? "has closed"}. Your deposit is refunded in full.`,
  }),
  "auction.auction_won": (d) => ({
    title: `You won ${auction(d)}`,
    body: `Your winning bid was ${money(d, "finalPricePaise")}. Your deposit is credited to your invoice — pay the balance from My auction activities before the deadline.`,
  }),
  "auction.auction_lost": (d) => ({
    title: `${auction(d)} was won by another bidder`,
    body: `The winning bid was ${money(d, "finalPricePaise")}. Your deposit is refunded in full.`,
  }),
  "auction.refund_eligible": (d) => ({
    title: "Your deposit will be refunded",
    body: `Your deposit of ${money(d, "amountPaise")} for ${auction(d)} qualifies for a full refund because ${reasonText(AUCTION_REFUND_REASONS, d)}.`,
  }),
  "auction.refund_initiated": (d) => ({
    title: "Deposit refund started",
    body: `The refund of ${money(d, "amountPaise")} for ${auction(d)} has been sent to the payment provider.`,
  }),
  "auction.refund_completed": (d) => ({
    title: "Deposit refunded",
    body: `The payment provider confirmed the refund of ${money(d, "amountPaise")} for ${auction(d)}.${reference(d)}`,
  }),
  "auction.refund_failed": (d) => ({
    title: "Deposit refund delayed",
    body: `A refund attempt of ${money(d, "amountPaise")} for ${auction(d)} did not go through. We retry automatically; you do not need to do anything.`,
  }),
  "auction.deposit_adjusted": (d) => ({
    title: "Deposit credited to your invoice",
    body: `Your deposit of ${money(d, "amountPaise")} was credited against your invoice for ${auction(d)}.`,
  }),
  "auction.payment_overdue": (d) => ({
    title: "Payment overdue",
    body: `Your invoice for ${auction(d)} (${money(d, "amountDuePaise")} due) passed its payment deadline of ${when(d, "dueAt")}. Our team will contact you.`,
  }),
};

export const NOTIFICATION_EVENTS = Object.keys(RENDERERS);

export function renderNotification(event: string, data: NotificationData | null | undefined): RenderedNotification {
  const render = RENDERERS[event];
  if (!render) return { title: "Notification", body: "" };
  return render(data ?? {});
}
