import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { closeDueAuctions, processAuctionRefunds } from "@/modules/auction/server/jobs";

/** Scheduled job (every minute): close ended auctions, flag overdue invoices, then process deposit refunds. */
export async function GET(request: Request) {
  await connection();
  const secret = getServerEnv().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const closed = await closeDueAuctions();
  const refunds = await processAuctionRefunds();
  return Response.json({ closed, refunds }, { headers: { "Cache-Control": "no-store" } });
}
