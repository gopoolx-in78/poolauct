/** Shapes returned by the api.poolx_* functions (money arrives as strings — convert with `paise()`). */

export type PoolStatus =
  "DRAFT" | "ACTIVE" | "THRESHOLD_MET" | "NEGOTIATING" | "LOCKED" | "ORDERING" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export type PoolSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  productName: string;
  status: PoolStatus;
  kind: "PUBLIC" | "PRIVATE";
  category: { slug: string; name: string } | null;
  seller: { name: string; verified: boolean } | null;
  unitLabel: string;
  baseUnitPricePaise: string;
  currentUnitPricePaise: string;
  currentDiscountBps: number;
  referencePricePaise: string | null;
  referencePriceSource: string | null;
  tierBasis: "MEMBERS" | "QUANTITY";
  activeMembers: number;
  activeQuantity: number;
  minMembers: number;
  targetMembers: number;
  maxMembers: number | null;
  minQtyPerMember: number;
  maxQtyPerMember: number;
  platformFeeBps: number;
  startsAt: string;
  deadlineAt: string;
  isJoinable: boolean;
  nextTier: { threshold: number; discountBps: number; unitPricePaise: string } | null;
};

export type PoolDetail = PoolSummary & {
  description: string;
  specs: { label: string; value: string }[];
  withdrawalPolicy: string;
  terms: string;
  deliveryNote: string | null;
  tiers: { threshold: number; discountBps: number; unitPricePaise: string }[];
};

export type PoolList = { total: number; limit: number; offset: number; items: PoolSummary[] };

export type Category = { slug: string; name: string; description: string | null };

export const POOL_STATUS_LABEL: Record<PoolStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Open",
  THRESHOLD_MET: "Target reached",
  NEGOTIATING: "Negotiating",
  LOCKED: "Deal locked",
  ORDERING: "Ordering",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/** Maps 'CODE: message' errors raised by the SQL API to user-facing copy. */
export function poolxErrorMessage(raw: string | undefined): string {
  const code = raw?.split(":")[0]?.trim();
  switch (code) {
    case "POOL_NOT_FOUND":
      return "That pool could not be found.";
    case "POOL_NOT_JOINABLE":
      return "This pool isn’t open for new members right now.";
    case "INVALID_QUANTITY":
      return (
        raw!
          .split(":")
          .slice(1)
          .join(":")
          .trim()
          .replace(/^choose/, "Choose") + "."
      );
    case "SELLER_CANNOT_JOIN":
      return "Sellers can’t join their own pool.";
    case "NOT_ALLOWED":
      return "You can’t rejoin this pool.";
    case "NOT_A_MEMBER":
      return "You’re not in this pool.";
    case "WITHDRAWAL_CLOSED":
      return "Withdrawals closed when the pool stopped accepting members.";
    case "WITHDRAW_UNCONFIRMED":
      return "Please tick the confirmation box to withdraw.";
    case "TOO_MANY_OPEN_REQUESTS":
      return "You already have 5 requests under review.";
    default:
      return "Something went wrong. Please try again.";
  }
}
