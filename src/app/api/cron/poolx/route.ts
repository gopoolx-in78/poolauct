import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { closeDuePools, processPoolxRefunds } from "@/modules/poolx/server/refunds";

/** Scheduled job: close pools past their deadline, then process PoolX refunds. Bearer CRON_SECRET required. */
export async function GET(request: Request) {
  await connection();
  const secret = getServerEnv().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const closed = await closeDuePools();
  const refunds = await processPoolxRefunds();
  return Response.json({ closed, refunds }, { headers: { "Cache-Control": "no-store" } });
}
