import { connection } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Liveness / readiness probe. Reports only coarse status — never versions of internals,
 * hostnames, error messages or configuration values.
 */
export async function GET() {
  // Must run per request — a prerendered health check would always report "ok".
  await connection();
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";

  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(new URL("/auth/v1/health", publicEnv.NEXT_PUBLIC_SUPABASE_URL), {
        headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      database = res.ok ? "ok" : "unreachable";
    } catch {
      database = "unreachable";
    }
  }

  const healthy = database !== "unreachable";
  return Response.json(
    { status: healthy ? "ok" : "degraded", checks: { app: "ok", database } },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
