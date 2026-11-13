import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/env";

describe("server env validation", () => {
  it("defaults to local + sandbox", () => {
    const env = serverSchema.parse({});
    expect(env.APP_ENV).toBe("local");
    expect(env.PAYMENT_PROVIDER).toBe("sandbox");
  });

  it("refuses the sandbox payment provider in production (TD-06)", () => {
    const r = serverSchema.safeParse({ APP_ENV: "production", PAYMENT_PROVIDER: "sandbox" });
    expect(r.success).toBe(false);
  });

  it("requires all Razorpay secrets when Razorpay is selected", () => {
    const r = serverSchema.safeParse({ APP_ENV: "staging", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("RAZORPAY_KEY_SECRET");
      expect(paths).toContain("RAZORPAY_WEBHOOK_SECRET");
    }
  });

  it("requires a long cron secret when set", () => {
    expect(serverSchema.safeParse({ CRON_SECRET: "short" }).success).toBe(false);
  });
});
