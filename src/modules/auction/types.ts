/** Shapes returned by api.auction_* (money as strings — convert with `paise()`). */

export type AuctionStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "CLOSED" | "CANCELLED";

export type AuctionSummary = {
  id: string;
  slug: string;
  title: string;
  type: "TIMED_ENGLISH" | "RESERVE";
  status: AuctionStatus;
  category: { slug: string; name: string; isVehicle: boolean } | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  condition: "LIKE_NEW" | "GOOD" | "FAIR" | "POOR" | "FOR_PARTS";
  location: string;
  seller: { name: string; verified: boolean; kind: "PLATFORM" | "THIRD_PARTY" } | null;
  startingPricePaise: string;
  currentBidPaise: string | null;
  minNextBidPaise: string;
  minIncrementPaise: string;
  bidCount: number;
  bidderCount: number;
  startsAt: string;
  endsAt: string;
  depositAmountPaise: string | null;
  reserve: { disclosure: "HIDDEN" } | { disclosure: "MET_FLAG"; met: boolean } | null;
  result: { outcome: "WON" | "RESERVE_NOT_MET" | "NO_BIDS" | "CANCELLED"; finalPricePaise: string | null } | null;
};

export type AuctionDetail = AuctionSummary & {
  description: string;
  pickupTerms: string;
  charges: { label: string; amountPaise: number }[];
  depositTerms: string;
  termsVersion: string;
  winnerPaymentDeadlineHours: number;
  antiSnipe: { windowSeconds: number; extendSeconds: number; maxExtensions: number; used: number } | null;
  vehicle: {
    manufacturer: string;
    variant: string | null;
    registrationState: string;
    registrationMasked: string;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    ownersCount: number;
    insuranceValidUntil: string | null;
    rcStatus: "NOT_VERIFIED" | "MANUALLY_VERIFIED" | "PROVIDER_VERIFIED";
    pucStatus: string;
    accidentDisclosure: string;
    damageDisclosure: string;
    serviceHistory: string | null;
    ownershipTransferTerms: string;
  } | null;
  inspections: { inspector: string; inspectedAt: string; location: string; summary: string; verified: boolean }[];
};

export type AuctionList = { total: number; limit: number; offset: number; items: AuctionSummary[] };

export type MyAuctionStatus = {
  verified: boolean;
  isSeller: boolean;
  participant: { status: string; alias: number; termsVersion: string } | null;
  deposit: { status: DepositStatus; amountPaise: string; paidAt: string | null; attemptId: string | null } | null;
  myHighestBidPaise: string | null;
  isLeading: boolean;
} | null;

export type DepositStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PAYMENT_REVERSED"
  | "REFUND_ELIGIBLE"
  | "REFUND_INITIATED"
  | "REFUND_PROCESSING"
  | "REFUNDED"
  | "REFUND_FAILED"
  | "WINNER_ADJUSTMENT_PENDING"
  | "ADJUSTED"
  | "DEFAULT_REVIEW"
  | "FORFEITED";

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Upcoming",
  LIVE: "Live",
  ENDED: "Ended — finalising",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const CONDITION_LABEL: Record<AuctionSummary["condition"], string> = {
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  FOR_PARTS: "For parts",
};

/** Plain-language deposit states for bidders (§7.10). */
export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  CREATED: "Not paid",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid — bidding enabled",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_REVERSED: "Payment reversed",
  REFUND_ELIGIBLE: "Refund due",
  REFUND_INITIATED: "Refund initiated",
  REFUND_PROCESSING: "Refund processing",
  REFUNDED: "Refunded",
  REFUND_FAILED: "Refund delayed — retrying",
  WINNER_ADJUSTMENT_PENDING: "Won — to be credited to your invoice",
  ADJUSTED: "Credited to your invoice",
  DEFAULT_REVIEW: "Under review (payment overdue)",
  FORFEITED: "Forfeited",
};

export const REFUND_REASON_LABEL: Record<string, string> = {
  LOST: "Auction lost",
  NO_BID: "You did not bid",
  CANCELLED: "Auction cancelled",
  SELLER_CANCELLED: "Seller withdrew the item",
  RESERVE_NOT_MET: "Reserve not met",
  NO_WINNER: "No winning bid",
  LATE_CAPTURE: "Payment arrived after the auction closed",
  DUPLICATE_PAYMENT: "Duplicate payment",
  DEFAULT_RESOLVED: "Sale voided after review",
  MANUAL: "Refund by our team",
};

export function auctionErrorMessage(raw: string | undefined): string {
  const code = raw?.split(":")[0]?.trim();
  const rest = raw?.split(":").slice(1).join(":").trim();
  switch (code) {
    case "AUCTION_NOT_FOUND":
      return "That auction could not be found.";
    case "AUCTION_CLOSED":
      return "Registration is closed for this auction.";
    case "AUCTION_NOT_LIVE":
      return "This auction is not accepting bids right now.";
    case "TERMS_NOT_ACCEPTED":
      return "Please accept the current auction terms to continue.";
    case "SELLER_CANNOT_BID":
      return "Sellers can’t take part in their own auctions.";
    case "VERIFICATION_REQUIRED":
      return "Complete bidder verification before taking part.";
    case "RESTRICTED":
      return "You can’t take part in this auction. Please contact support.";
    case "DEPOSIT_REQUIRED":
      return "Pay the refundable deposit for this auction to bid.";
    case "DEPOSIT_PENDING":
      return "Your deposit payment isn’t confirmed yet. Refresh in a moment.";
    case "BID_TOO_LOW":
      return "Someone bid first or your amount is below the minimum. Check the minimum next bid and try again.";
    case "INVOICE_NOT_FOUND":
      return "That invoice could not be found.";
    case "INVALID_STATE":
      return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) + "." : "That action isn’t available right now.";
    default:
      return "Something went wrong. Please try again.";
  }
}
