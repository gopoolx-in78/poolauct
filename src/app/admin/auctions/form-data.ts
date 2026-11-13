import "server-only";
import type { AuctionDetail } from "@/modules/auction/types";
import type { LISTING_FIELDS } from "@/modules/auction/validation";
import { toIstLocal } from "@/app/admin/poolx/form-data";

export type ListingFormValues = Record<(typeof LISTING_FIELDS)[number], string>;

export type AdminAuction = AuctionDetail & {
  rawStatus: "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED";
  reservePricePaise: string | null;
  reserveDisclosure: "MET_FLAG" | "HIDDEN";
  depositMode: "FIXED" | "PERCENT_OF_STARTING" | null;
  depositValue: string | null;
  cancelReason: string | null;
  sellerId: string;
  city: string;
  state: string;
  participants: number;
  paidDeposits: number;
};

export function paiseToRupeesString(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "";
  const n = BigInt(v);
  const whole = n / 100n;
  const frac = n % 100n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0")}`;
}

export function emptyListingValues(nowIso: string): ListingFormValues {
  const now = new Date(nowIso).getTime();
  return {
    slug: "",
    title: "",
    categorySlug: "",
    isVehicle: "false",
    brand: "",
    model: "",
    year: "",
    condition: "GOOD",
    description: "",
    city: "",
    state: "",
    pickupTerms: "",
    charges: "",
    startingPrice: "",
    reservePrice: "",
    reserveDisclosure: "MET_FLAG",
    minIncrement: "",
    startsAt: toIstLocal(new Date(now + 86_400_000).toISOString()),
    endsAt: toIstLocal(new Date(now + 8 * 86_400_000).toISOString()),
    antiSnipeMinutes: "5",
    antiSnipeExtendMinutes: "5",
    maxExtensions: "10",
    // no deposit amount is pre-filled: staff must choose it (honesty rule — never invent deposit values)
    depositMode: "",
    depositValue: "",
    depositTerms: "",
    winnerPaymentDeadlineHours: "48",
    manufacturer: "",
    variant: "",
    registrationState: "",
    registrationMasked: "",
    fuelType: "",
    transmission: "",
    odometerKm: "",
    ownersCount: "",
    insuranceValidUntil: "",
    pucStatus: "UNKNOWN",
    accidentDisclosure: "",
    damageDisclosure: "",
    serviceHistory: "",
    ownershipTransferTerms: "",
  };
}

export function auctionToValues(a: AdminAuction): ListingFormValues {
  const v = a.vehicle;
  return {
    slug: a.slug,
    title: a.title,
    categorySlug: a.category?.slug ?? "",
    isVehicle: a.category?.isVehicle ? "true" : "false",
    brand: a.brand ?? "",
    model: a.model ?? "",
    year: a.year ? String(a.year) : "",
    condition: a.condition,
    description: a.description,
    city: a.city,
    state: a.state,
    pickupTerms: a.pickupTerms,
    charges: a.charges.map((c) => `${c.label}: ${paiseToRupeesString(c.amountPaise)}`).join("\n"),
    startingPrice: paiseToRupeesString(a.startingPricePaise),
    reservePrice: paiseToRupeesString(a.reservePricePaise),
    reserveDisclosure: a.reserveDisclosure,
    minIncrement: paiseToRupeesString(a.minIncrementPaise),
    startsAt: toIstLocal(a.startsAt),
    endsAt: toIstLocal(a.endsAt),
    antiSnipeMinutes: String((a.antiSnipe?.windowSeconds ?? 0) / 60),
    antiSnipeExtendMinutes: String((a.antiSnipe?.extendSeconds ?? 0) / 60),
    maxExtensions: String(a.antiSnipe?.maxExtensions ?? 0),
    depositMode: a.depositMode ?? "",
    depositValue:
      a.depositValue === null
        ? ""
        : a.depositMode === "FIXED"
          ? paiseToRupeesString(a.depositValue)
          : String(Number(a.depositValue) / 100),
    depositTerms: a.depositTerms ?? "",
    winnerPaymentDeadlineHours: a.winnerPaymentDeadlineHours ? String(a.winnerPaymentDeadlineHours) : "",
    manufacturer: v?.manufacturer ?? "",
    variant: v?.variant ?? "",
    registrationState: v?.registrationState ?? "",
    registrationMasked: v?.registrationMasked ?? "",
    fuelType: v?.fuelType ?? "",
    transmission: v?.transmission ?? "",
    odometerKm: v ? String(v.odometerKm) : "",
    ownersCount: v ? String(v.ownersCount) : "",
    insuranceValidUntil: v?.insuranceValidUntil ?? "",
    pucStatus: v?.pucStatus ?? "UNKNOWN",
    accidentDisclosure: v?.accidentDisclosure ?? "",
    damageDisclosure: v?.damageDisclosure ?? "",
    serviceHistory: v?.serviceHistory ?? "",
    ownershipTransferTerms: v?.ownershipTransferTerms ?? "",
  };
}
