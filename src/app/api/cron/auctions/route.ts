import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { closeDueAuctions, processAuctionRefunds, queueAuctionReminders } from "@/modules/auction/server/jobs";

/**
 * Scheduled job (every minute): close ended auctions, flag overdue invoices, process deposit refunds, then queue
 * "starting soon" / "ending soon" reminders.
 */
export async function GET(request: Request) {
  await connection();
  const secret = getServerEnv().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const closed = await closeDueAuctions();
  const refunds = await processAuctionRefunds();
  const reminders = await queueAuctionReminders();
  return Response.json({ closed, refunds, reminders }, { headers: { "Cache-Control": "no-store" } });
}
