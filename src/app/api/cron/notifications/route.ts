import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { processNotificationDeliveries } from "@/modules/notifications/server/process";

/** Scheduled job (every minute): send queued notification e-mails and record each outcome. */
export async function GET(request: Request) {
  await connection();
  const secret = getServerEnv().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const deliveries = await processNotificationDeliveries();
  return Response.json({ deliveries }, { headers: { "Cache-Control": "no-store" } });
}
