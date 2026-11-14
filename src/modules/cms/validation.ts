import { z } from "zod";

/** Mirrors the CHECK constraints on cms.document_revisions / cms.faqs / cms.seo_entries (migration 0013). */

const noControl = (s: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
const singleLine = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);

const optionalLength = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .refine(
      (s) => s === "" || (s.length >= min && s.length <= max),
      `${what}: ${min}–${max} characters, or leave empty`,
    )
    .refine(singleLine, `${what} must be a single line`);

export const documentSchema = z.object({
  kind: z.enum(["PAGE", "POST"]),
  slug: z
    .string()
    .trim()
    .min(3, "Web address: at least 3 characters")
    .max(80, "Web address: at most 80 characters")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Web address: lowercase letters, numbers and single hyphens"),
  title: z
    .string()
    .trim()
    .min(3, "Title: at least 3 characters")
    .max(120, "Title: at most 120 characters")
    .refine(singleLine, "Title must be a single line"),
  summary: z
    .string()
    .trim()
    .max(300, "Summary: at most 300 characters")
    .refine(singleLine, "Summary must be a single line"),
  body: z
    .string()
    .min(1, "Write the content")
    .max(50_000, "Content: at most 50,000 characters")
    .refine(noControl, "Content contains invalid characters"),
  seoTitle: optionalLength(10, 70, "Search title"),
  seoDescription: optionalLength(50, 160, "Search description"),
  note: z.string().trim().max(200, "Change note: at most 200 characters"),
});
export type DocumentInput = z.infer<typeof documentSchema>;
export const DOCUMENT_FIELDS = [
  "kind",
  "slug",
  "title",
  "summary",
  "body",
  "seoTitle",
  "seoDescription",
  "note",
] as const;

export const faqSchema = z.object({
  topic: z.enum(["general", "poolx", "auction"]),
  question: z
    .string()
    .trim()
    .min(5, "Question: at least 5 characters")
    .max(200, "Question: at most 200 characters")
    .refine(singleLine, "Question must be a single line"),
  answer: z
    .string()
    .trim()
    .min(5, "Answer: at least 5 characters")
    .max(2000, "Answer: at most 2,000 characters")
    .refine(noControl, "Answer contains invalid characters"),
  sort: z.coerce.number().int().min(0).max(1000),
  status: z.enum(["PUBLISHED", "HIDDEN"]),
});

export const seoSchema = z.object({
  title: optionalLength(10, 70, "Title"),
  description: optionalLength(50, 160, "Description"),
});
