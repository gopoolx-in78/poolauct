import { describe, expect, it } from "vitest";
import { checkLaunchEnv } from "@/modules/core/launch-checks";

const ready = {
  APP_ENV: "production",
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_live_x",
  RAZORPAY_KEY_SECRET: "secret-value-should-never-print",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  EMAIL_PROVIDER: "future-provider",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-should-never-print",
  CRON_SECRET: "c".repeat(40),
  NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_BRAND_NAME: "Brand",
};

const failing = (env: Record<string, string | undefined>) =>
  checkLaunchEnv(env)
    .filter((c) => !c.ok)
    .map((c) => c.key);

describe("launch environment checks", () => {
  it("fails a local development environment on every launch-critical setting", () => {
    expect(
      failing({
        APP_ENV: "local",
        PAYMENT_PROVIDER: "sandbox",
        SANDBOX_WEBHOOK_SECRET: "s".repeat(40),
        EMAIL_PROVIDER: "mailpit",
        EMAIL_FROM: "a@example.test",
        MAILPIT_URL: "http://127.0.0.1:56324",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
      }),
    ).toEqual(
      expect.arrayContaining([
        "app_env_production",
        "live_payment_provider",
        "email_provider",
        "supabase_service_role_key_set",
        "cron_secret_set",
        "site_url_public_https",
        "supabase_url_public_https",
        "brand_name_set",
      ]),
    );
  });

  it("refuses the sandbox payment provider and the mailpit inbox in production", () => {
    const keys = failing({ ...ready, PAYMENT_PROVIDER: "sandbox", EMAIL_PROVIDER: "mailpit" });
    expect(keys).toEqual(expect.arrayContaining(["server_env_valid", "live_payment_provider", "email_provider"]));
  });

  it("rejects non-https, local and .test public URLs", () => {
    expect(failing({ ...ready, NEXT_PUBLIC_SITE_URL: "http://shop.example.com" })).toContain("site_url_public_https");
    expect(failing({ ...ready, NEXT_PUBLIC_SITE_URL: "https://localhost" })).toContain("site_url_public_https");
    expect(failing({ ...ready, NEXT_PUBLIC_SUPABASE_URL: "https://api.staging.test" })).toContain(
      "supabase_url_public_https",
    );
  });

  it("never echoes secret values in check details", () => {
    const text = JSON.stringify(checkLaunchEnv(ready));
    expect(text).not.toContain("secret-value-should-never-print");
    expect(text).not.toContain("service-role-key-should-never-print");
  });

  it("passes the environment checks only when every setting is production-ready", () => {
    // EMAIL_PROVIDER has no production adapter yet (OD-07), so the schema rejects any other value; everything else passes.
    expect(failing(ready)).toEqual(["server_env_valid"]);
  });
});
