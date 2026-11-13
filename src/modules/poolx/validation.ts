import { z } from "zod";
import { paise, type Paise } from "@/lib/money";

const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx): number | undefined => {
      if (v === "") return undefined;
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isInteger(n) || n < 1 || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number from 1 to ${max.toLocaleString("en-IN")}.` });
        return z.NEVER;
      }
      return n;
    });

/** Rupee amount typed by a person ("1,250" or "1250.50") → paise. Empty → null. */
export const rupeesToPaise = z
  .string()
  .trim()
  .transform((v, ctx): Paise | null => {
    if (v === "") return null;
    const clean = v.replace(/,/g, "");
    if (!/^\d{1,11}(\.\d{1,2})?$/.test(clean)) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, e.g. 1250 or 1250.50." });
      return z.NEVER;
    }
    const [whole, frac = ""] = clean.split(".");
    return paise(BigInt(whole!) * 100n + BigInt(frac.padEnd(2, "0")));
  });

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required.`).max(max, `Use at most ${max} characters.`);

export const poolRequestSchema = z.object({
  title: text(3, 120, "A title"),
  product: text(2, 120, "The product or service"),
  description: z.string().trim().min(10, "Describe what you need (at least 10 characters).").max(3000),
  category: z.string().trim().max(60),
  estimatedQuantity: optionalInt(1_000_000),
  targetParticipants: optionalInt(100_000),
  expectedUnitPrice: rupeesToPaise,
  specifications: z.string().trim().max(2000),
  preferredSeller: z.string().trim().max(120),
  deliveryLocation: text(2, 200, "A delivery location"),
  neededBy: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Enter a valid date."),
});

const intIn = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx): number => {
      const n = Number(v);
      if (v === "" || !Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}: enter a whole number from ${min} to ${max}.` });
        return z.NEVER;
      }
      return n;
    });

/** "2026-11-20T18:00" from <input type="datetime-local"> is interpreted as India time (IST, UTC+05:30). */
export const istDateTime = z
  .string()
  .trim()
  .transform((v, ctx): string => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Enter a date and time." });
      return z.NEVER;
    }
    return new Date(`${v}:00+05:30`).toISOString();
  });

/** Percentage typed by staff ("12.5") → basis points. */
const percentToBps = (max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx): number => {
      const n = Number(v === "" ? "0" : v);
      if (!Number.isFinite(n) || n < 0 || n > max || Math.round(n * 100) !== n * 100) {
        ctx.addIssue({ code: "custom", message: `Enter a percentage from 0 to ${max} (up to 2 decimals).` });
        return z.NEVER;
      }
      return Math.round(n * 100);
    });

/** "Label: value" per line → [{label, value}] */
const specsText = z
  .string()
  .max(4000)
  .transform((v, ctx) => {
    const rows = v
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const out: { label: string; value: string }[] = [];
    for (const row of rows) {
      const i = row.indexOf(":");
      if (i < 1) {
        ctx.addIssue({ code: "custom", message: `Use “Label: value” on each line (problem: “${row.slice(0, 30)}”).` });
        return z.NEVER;
      }
      out.push({
        label: row.slice(0, i).trim().slice(0, 60),
        value: row
          .slice(i + 1)
          .trim()
          .slice(0, 200),
      });
    }
    return out.slice(0, 30);
  });

export const adminPoolSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
      .min(3)
      .max(80),
    title: text(3, 120, "A title"),
    summary: z.string().trim().min(10, "Write a summary of at least 10 characters.").max(240),
    description: z.string().trim().max(5000),
    productName: text(2, 120, "The product name"),
    specs: specsText,
    categorySlug: z.string().trim().min(1, "Choose a category."),
    sellerId: z.union([z.literal(""), z.uuid()]),
    unitLabel: z.string().trim().min(1).max(20),
    basePrice: rupeesToPaise.refine((v) => v !== null && v > 0n, "Enter the base price per unit."),
    referencePrice: rupeesToPaise,
    referenceSource: z.string().trim().max(200),
    tierBasis: z.enum(["MEMBERS", "QUANTITY"]),
    minQty: intIn(1, 100000, "Minimum quantity"),
    maxQty: intIn(1, 100000, "Maximum quantity"),
    minMembers: intIn(1, 100000, "Minimum members"),
    targetMembers: intIn(1, 100000, "Target members"),
    maxMembers: z
      .string()
      .trim()
      .transform((v, ctx): number | null => {
        if (v === "") return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 100000) {
          ctx.addIssue({ code: "custom", message: "Maximum members: enter a whole number or leave blank." });
          return z.NEVER;
        }
        return n;
      }),
    platformFeePercent: percentToBps(100),
    withdrawalPolicy: z.string().trim().min(10, "Describe the withdrawal rule (at least 10 characters).").max(1000),
    terms: z.string().trim().max(5000),
    deliveryNote: z.string().trim().max(500),
    startsAt: istDateTime,
    deadlineAt: istDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.maxQty < v.minQty)
      ctx.addIssue({ code: "custom", path: ["maxQty"], message: "Must be at least the minimum quantity." });
    if (v.targetMembers < v.minMembers)
      ctx.addIssue({ code: "custom", path: ["targetMembers"], message: "Must be at least the minimum members." });
    if (v.maxMembers !== null && v.maxMembers < v.targetMembers)
      ctx.addIssue({ code: "custom", path: ["maxMembers"], message: "Must be at least the target." });
    if ((v.referencePrice === null) !== (v.referenceSource === "")) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceSource"],
        message: "A reference price needs a stated source (and vice versa).",
      });
    }
    if (new Date(v.deadlineAt) <= new Date(v.startsAt))
      ctx.addIssue({ code: "custom", path: ["deadlineAt"], message: "Must be after the start." });
  });

export type AdminPoolInput = z.infer<typeof adminPoolSchema>;
