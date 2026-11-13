import { MAILPIT, sql } from "./helpers";

/**
 * Local test hygiene: clear the app's rate-limit windows (all runs share one local IP) and the test mailbox.
 * Only ever targets the local Supabase container and local Mailpit.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) return; // never touch a remote environment
  sql("delete from core.rate_limits");
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" }).catch(() => undefined);
}
