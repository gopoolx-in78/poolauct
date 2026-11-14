import { z } from "zod";

/**
 * Public (browser-safe) environment. Only NEXT_PUBLIC_* values belong here.
 * Next.js inlines these at build time, so they must be referenced literally.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_BRAND_NAME: z.string().trim().max(60).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
});

/**
 * Server environment schema. Parsed lazily by `getServerEnv()` in `env.server.ts`
 * so that server secrets are never bundled into client code.
 */
export const serverSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_DB_URL: z.string().min(1).optional(),
    PAYMENT_PROVIDER: z.enum(["sandbox", "razorpay"]).default("sandbox"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    SANDBOX_WEBHOOK_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(32).optional(),
    FIELD_ENCRYPTION_KEY: z.string().optional(),
    // E-mail delivery (OD-07). "mailpit" is the local test inbox — dev/test only, like the sandbox payment adapter.
    EMAIL_PROVIDER: z.enum(["none", "mailpit"]).default("none"),
    EMAIL_FROM: z.email().optional(),
    MAILPIT_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    // TD-06: the sandbox payment adapter must never run in production.
    if (env.APP_ENV === "production" && env.PAYMENT_PROVIDER === "sandbox") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message: "The sandbox payment provider is not allowed when APP_ENV=production.",
      });
    }
    if (env.PAYMENT_PROVIDER === "sandbox" && env.APP_ENV !== "production" && !env.SANDBOX_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["SANDBOX_WEBHOOK_SECRET"],
        message: "SANDBOX_WEBHOOK_SECRET (32+ chars) is required for the sandbox payment provider.",
      });
    }
    if (env.APP_ENV === "production" && env.EMAIL_PROVIDER === "mailpit") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "The mailpit test inbox is not allowed when APP_ENV=production.",
      });
    }
    if (env.EMAIL_PROVIDER === "mailpit") {
      for (const key of ["EMAIL_FROM", "MAILPIT_URL"] as const) {
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required for EMAIL_PROVIDER=mailpit.` });
      }
    }
    if (env.PAYMENT_PROVIDER === "razorpay") {
      for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required for Razorpay.` });
        }
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;
