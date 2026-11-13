import { z } from "zod";
import { istDateTime, rupeesToPaise } from "@/modules/poolx/validation";

/** Field names posted by the admin listing form. */
export const LISTING_FIELDS = [
  "slug",
  "title",
  "categorySlug",
  "isVehicle",
  "brand",
  "model",
  "year",
  "condition",
  "description",
  "city",
  "state",
  "pickupTerms",
  "charges",
  "startingPrice",
  "reservePrice",
  "reserveDisclosure",
  "minIncrement",
  "startsAt",
  "endsAt",
  "antiSnipeMinutes",
  "antiSnipeExtendMinutes",
  "maxExtensions",
  "depositMode",
  "depositValue",
  "depositTerms",
  "winnerPaymentDeadlineHours",
  "manufacturer",
  "variant",
  "registrationState",
  "registrationMasked",
  "fuelType",
  "transmission",
  "odometerKm",
  "ownersCount",
  "insuranceValidUntil",
  "pucStatus",
  "accidentDisclosure",
  "damageDisclosure",
  "serviceHistory",
  "ownershipTransferTerms",
] as const;

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: at least ${min} characters.`).max(max, `${label}: at most ${max} characters.`);
const optText = (max: number) => z.string().trim().max(max);
const int = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx): number => {
      const n = Number(v);
      if (v === "" || !Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}: whole number ${min}–${max}.` });
        return z.NEVER;
      }
      return n;
    });

/** "Label: 500" per line (rupees) → [{label, amountPaise}] */
const chargesText = z
  .string()
  .max(2000)
  .transform((v, ctx) => {
    const out: { label: string; amountPaise: number }[] = [];
    for (const line of v
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      const i = line.lastIndexOf(":");
      const amount = rupeesToPaise.safeParse(i > 0 ? line.slice(i + 1) : "");
      if (i < 1 || !amount.success || amount.data === null || amount.data <= 0n) {
        ctx.addIssue({
          code: "custom",
          message: `Use “Label: amount in ₹” on each line (problem: “${line.slice(0, 30)}”).`,
        });
        return z.NEVER;
      }
      out.push({ label: line.slice(0, i).trim().slice(0, 80), amountPaise: Number(amount.data) });
    }
    return out.slice(0, 10);
  });

const paiseRequired = (label: string) => rupeesToPaise.refine((v) => v !== null && v > 0n, `${label} is required.`);

export const listingSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
      .min(3)
      .max(90)
      .refine((s) => !["browse", "sell", "category"].includes(s), "That word is reserved."),
    title: text(3, 140, "Title"),
    categorySlug: z.string().trim().min(1, "Choose a category."),
    isVehicle: z.enum(["true", "false"]),
    brand: optText(80),
    model: optText(80),
    year: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1900 && +v <= 2100), "Year: four digits."),
    condition: z.enum(["LIKE_NEW", "GOOD", "FAIR", "POOR", "FOR_PARTS"]),
    description: text(20, 8000, "Description"),
    city: text(2, 80, "City"),
    state: text(2, 80, "State"),
    pickupTerms: text(5, 2000, "Pickup terms"),
    charges: chargesText,
    startingPrice: paiseRequired("Starting price"),
    reservePrice: rupeesToPaise,
    reserveDisclosure: z.enum(["MET_FLAG", "HIDDEN"]),
    minIncrement: paiseRequired("Minimum increment"),
    startsAt: istDateTime,
    endsAt: istDateTime,
    antiSnipeMinutes: int(0, 60, "Anti-snipe window"),
    antiSnipeExtendMinutes: int(0, 60, "Extension"),
    maxExtensions: int(0, 100, "Maximum extensions"),
    depositMode: z.enum(["FIXED", "PERCENT_OF_STARTING"], { error: "Choose how the deposit is calculated." }),
    depositValue: z.string().trim(),
    depositTerms: text(20, 4000, "Deposit terms"),
    winnerPaymentDeadlineHours: int(1, 720, "Winner payment deadline"),
    // vehicle (validated only for vehicle categories)
    manufacturer: optText(80),
    variant: optText(80),
    registrationState: optText(40),
    registrationMasked: optText(20),
    fuelType: z.string().trim(),
    transmission: z.string().trim(),
    odometerKm: z.string().trim(),
    ownersCount: z.string().trim(),
    insuranceValidUntil: z.string().trim(),
    pucStatus: z.string().trim(),
    accidentDisclosure: optText(2000),
    damageDisclosure: optText(2000),
    serviceHistory: optText(2000),
    ownershipTransferTerms: optText(2000),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.reservePrice !== null && v.startingPrice !== null && v.reservePrice < v.startingPrice)
      issue("reservePrice", "The reserve can’t be below the starting price.");
    if (new Date(v.endsAt) <= new Date(v.startsAt)) issue("endsAt", "Must be after the start.");
    // the deposit is mandatory and must be positive — there is no "no deposit" option
    if (v.depositMode === "FIXED") {
      const d = rupeesToPaise.safeParse(v.depositValue);
      if (!d.success || d.data === null || d.data <= 0n) issue("depositValue", "Enter a deposit above ₹0.");
    } else {
      const n = Number(v.depositValue);
      if (!Number.isFinite(n) || n <= 0 || n > 100 || Math.round(n * 100) !== n * 100)
        issue("depositValue", "Enter a percentage above 0 (max 100, 2 decimals).");
    }
    if (v.isVehicle === "true") {
      if (v.manufacturer.length < 2) issue("manufacturer", "Manufacturer is required.");
      if (v.registrationState.length < 2) issue("registrationState", "Registration state is required.");
      if (!/^[A-Z0-9 •]{4,20}$/.test(v.registrationMasked) || !v.registrationMasked.includes("•")) {
        issue("registrationMasked", "Enter a masked number using • for hidden characters, e.g. MH 12 •• ••34.");
      }
      if (!["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID"].includes(v.fuelType))
        issue("fuelType", "Choose a fuel type.");
      if (!["MANUAL", "AUTOMATIC"].includes(v.transmission)) issue("transmission", "Choose a transmission.");
      if (!/^\d{1,7}$/.test(v.odometerKm)) issue("odometerKm", "Odometer: whole kilometres.");
      if (!/^\d{1,2}$/.test(v.ownersCount)) issue("ownersCount", "Owners: whole number.");
      if (v.accidentDisclosure.length < 2)
        issue("accidentDisclosure", "Accident disclosure is required (write “None reported” if so).");
      if (v.damageDisclosure.length < 2) issue("damageDisclosure", "Damage disclosure is required.");
      if (v.ownershipTransferTerms.length < 5)
        issue("ownershipTransferTerms", "Describe how ownership is transferred.");
    }
  });

export type ListingInput = z.infer<typeof listingSchema>;

/** Converts validated form input into the api.auction_admin_save_listing payload (paise as strings). */
export function toListingPayload(d: ListingInput) {
  const depositValue =
    d.depositMode === "FIXED"
      ? rupeesToPaise.parse(d.depositValue)!.toString()
      : String(Math.round(Number(d.depositValue) * 100));
  return {
    slug: d.slug,
    categorySlug: d.categorySlug,
    title: d.title,
    brand: d.brand,
    model: d.model,
    year: d.year,
    condition: d.condition,
    description: d.description,
    city: d.city,
    state: d.state,
    pickupTerms: d.pickupTerms,
    charges: d.charges,
    startingPricePaise: d.startingPrice!.toString(),
    reservePricePaise: d.reservePrice?.toString() ?? "",
    reserveDisclosure: d.reserveDisclosure,
    minIncrementPaise: d.minIncrement!.toString(),
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    antiSnipeWindowS: d.antiSnipeMinutes * 60,
    antiSnipeExtendS: d.antiSnipeExtendMinutes * 60,
    maxExtensions: d.maxExtensions,
    depositMode: d.depositMode,
    depositValue,
    depositTerms: d.depositTerms,
    winnerPaymentDeadlineHours: String(d.winnerPaymentDeadlineHours),
    vehicle:
      d.isVehicle === "true"
        ? {
            manufacturer: d.manufacturer,
            variant: d.variant,
            registrationState: d.registrationState,
            registrationMasked: d.registrationMasked,
            fuelType: d.fuelType,
            transmission: d.transmission,
            odometerKm: d.odometerKm,
            ownersCount: d.ownersCount,
            insuranceValidUntil: d.insuranceValidUntil,
            pucStatus: d.pucStatus || "UNKNOWN",
            accidentDisclosure: d.accidentDisclosure,
            damageDisclosure: d.damageDisclosure,
            serviceHistory: d.serviceHistory,
            ownershipTransferTerms: d.ownershipTransferTerms,
          }
        : null,
  };
}
