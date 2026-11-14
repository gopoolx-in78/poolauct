// Launch-readiness checks for the production environment (Phase 10, TD-71). Pure functions so they can be unit-tested;
// `scripts/launch-check.mts` runs them together with the database's `api.launch_readiness()`.
// Relative import with an extension so the script can run under plain Node (type stripping), without the "@/" alias.
import { serverSchema } from "../../lib/env.ts";

export type LaunchCheck = { key: string; ok: boolean; detail: string };

type Env = Record<string, string | undefined>;

const isLocalHost = (url: URL) => ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname);

function httpsPublicUrl(value: string | undefined): string | null {
  if (!value) return "not set";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "not a valid URL";
  }
  if (url.protocol !== "https:") return "must use https";
  if (isLocalHost(url) || url.hostname.endsWith(".test") || url.hostname.endsWith(".localhost"))
    return "points at a local or test host";
  return null;
}

/** Checks the environment a production build is about to run with. Details never include secret values. */
export function checkLaunchEnv(env: Env): LaunchCheck[] {
  const checks: LaunchCheck[] = [];
  const add = (key: string, ok: boolean, detail: string) => checks.push({ key, ok, detail });

  const parsed = serverSchema.safeParse(env);
  add(
    "server_env_valid",
    parsed.success,
    parsed.success
      ? "server settings valid"
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  );

  add("app_env_production", env.APP_ENV === "production", `APP_ENV=${env.APP_ENV ?? "(unset, defaults to local)"}`);
  add(
    "live_payment_provider",
    env.PAYMENT_PROVIDER === "razorpay",
    env.PAYMENT_PROVIDER === "razorpay"
      ? "razorpay"
      : `PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER ?? "sandbox"} — live provider needed (OD-02)`,
  );
  const email = env.EMAIL_PROVIDER ?? "none";
  add(
    "email_provider",
    email !== "none" && email !== "mailpit",
    email === "none" || email === "mailpit"
      ? `EMAIL_PROVIDER=${email} — a real e-mail provider is needed for receipts and refunds (OD-07)`
      : email,
  );
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"] as const)
    add(`${key.toLowerCase()}_set`, Boolean(env[key]), env[key] ? "set" : `${key} is not set`);

  const site = httpsPublicUrl(env.NEXT_PUBLIC_SITE_URL);
  add("site_url_public_https", site === null, site ?? "https, public host");
  const supa = httpsPublicUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  add("supabase_url_public_https", supa === null, supa ?? "https, public host");
  add(
    "brand_name_set",
    Boolean(env.NEXT_PUBLIC_BRAND_NAME?.trim()),
    env.NEXT_PUBLIC_BRAND_NAME?.trim() ? "set" : "NEXT_PUBLIC_BRAND_NAME is not set (OD-01)",
  );
  return checks;
}
