import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Best-effort client IP. Uses the first X-Forwarded-For hop, which is trustworthy only behind a proxy that overwrites it
 * (the VPS Nginx in deploy/nginx/poolx.conf sets it to the client address, TD-73). Used for rate limiting only, never
 * for authorisation.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || h.get("x-real-ip") || "unknown";
}

/** One-way hash so rate-limit buckets and security events never store raw emails or IPs. */
export function subjectHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|").toLowerCase()).digest("hex");
}

type Limit = { bucket: string; max: number; windowSeconds: number };

/**
 * Returns true if every limit allows the request. Fails CLOSED (blocks) if the limiter itself errors,
 * so an attacker cannot bypass limits by breaking the store.
 */
export async function withinRateLimits(limits: Limit[]): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  for (const l of limits) {
    const { data, error } = await admin
      .schema("api")
      .rpc("rate_limit_hit", { p_bucket: l.bucket, p_max: l.max, p_window_seconds: l.windowSeconds });
    if (error) {
      console.error("rate limiter unavailable", { code: error.code });
      return false;
    }
    if (data !== true) return false;
  }
  return true;
}

export type SecurityEventKind =
  | "SIGN_IN_FAILED"
  | "SIGN_IN_RATE_LIMITED"
  | "SIGN_UP_RATE_LIMITED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_CHANGED"
  | "MFA_ENROLLED"
  | "MFA_VERIFY_FAILED";

export async function recordSecurityEvent(kind: SecurityEventKind, userId: string | null, subject?: string) {
  const { error } = await createSupabaseAdminClient()
    .schema("api")
    .rpc("record_security_event", { p_kind: kind, p_user: userId, p_subject_hash: subject ?? null });
  if (error) console.error("failed to record security event", { kind, code: error.code });
}
