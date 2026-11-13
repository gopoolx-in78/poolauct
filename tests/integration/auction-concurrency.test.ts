/**
 * Acceptance test 8: simultaneous bids are processed atomically and the highest valid bid wins.
 * Real concurrency: N signed-in users fire bids in parallel through PostgREST (separate connections) against the
 * local Supabase stack. Setup uses the service role and local SQL; nothing here touches a remote environment.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY!;
const sql = (q: string) =>
  execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_poolx", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", q],
    {
      encoding: "utf8",
    },
  ).trim();

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const BIDDERS = 8;
const tag = Date.now().toString(36);
let auctionId = "";
let slug = "";
const users: { id: string; client: SupabaseClient }[] = [];

async function userClient(email: string) {
  const password = `Conc${randomUUID().slice(0, 8)}A1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

beforeAll(async () => {
  // deposit policy for the local test DB (owner decision in real environments)
  sql(
    `insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000') on conflict (key) do nothing`,
  );
  slug = `conc-${tag}`;
  auctionId =
    sql(`with s as (insert into auction.sellers (kind, display_name) values ('PLATFORM', 'Concurrency seller') returning id),
      x as (insert into auction.assets (seller_id, category_id, title, condition, description, location_city, location_state, pickup_terms)
            select s.id, (select id from auction.categories where slug = 'electronics'), 'Concurrency test laptop', 'GOOD',
                   'Laptop used by the automated concurrency test suite.', 'Pune', 'Maharashtra', 'Pickup from seller' from s returning id)
    insert into auction.auctions (slug, asset_id, status, starting_price_paise, min_increment_paise, starts_at, ends_at,
      deposit_mode, deposit_value, deposit_amount_paise, deposit_terms, terms_version, winner_payment_deadline_hours, published_at)
    select '${slug}', x.id, 'LIVE', 1000000, 10000, now() - interval '1 minute', now() + interval '1 hour',
      'FIXED', 50000, 50000, 'Refundable deposit used by the concurrency test only.', 'conc-terms', 24, now() from x
    returning id`).split("\n")[0]!;

  for (let i = 0; i < BIDDERS; i++) users.push(await userClient(`conc-${tag}-${i}@example.test`));

  // every bidder pays the deposit through the real payment path (start → attach → verified capture)
  for (const [i, u] of users.entries()) {
    const start = await u.client
      .schema("api")
      .rpc("auction_start_deposit", { p_auction: auctionId, p_terms_version: "conc-terms" });
    if (start.error) throw start.error;
    const attemptId = (start.data as { attemptId: string }).attemptId;
    const order = `conc-${tag}-${i}`;
    const attach = await admin
      .schema("api")
      .rpc("payments_attach_order", { p_attempt: attemptId, p_provider: "sandbox", p_provider_order_id: order });
    if (attach.error) throw attach.error;
    const cap = await admin.schema("api").rpc("payments_process_event", {
      p_provider: "sandbox",
      p_event_id: `evt-${order}`,
      p_type: "payment.captured",
      p_order_id: order,
      p_payment_id: `pay-${order}`,
      p_amount_paise: 50000,
      p_currency: "INR",
      p_refund_id: null,
      p_payload: {},
    });
    expect(cap.data).toBe("DEPOSIT_PAID");
  }
});

afterAll(() => {
  // end the test auction so it does not appear as live
  if (auctionId)
    sql(`update auction.auctions set ends_at = clock_timestamp() + interval '1 second' where id = '${auctionId}'`);
});

type BidResult = { ok: boolean; amount: number; code?: string };

async function fire(amounts: number[]): Promise<BidResult[]> {
  return Promise.all(
    amounts.map(async (amount, i) => {
      const u = users[i % users.length]!;
      const { error } = await u.client.schema("api").rpc("auction_place_bid", {
        p_auction: auctionId,
        p_amount_paise: amount,
        p_idempotency_key: `k-${tag}-${randomUUID()}`,
      });
      return { ok: !error, amount, code: error?.message.split(":")[0] };
    }),
  );
}

function state() {
  const [current, count, maxAccepted, distinctAmounts] = sql(`select a.current_bid_paise, a.bid_count,
      (select max(amount_paise) from auction.bids where auction_id = a.id), (select count(distinct amount_paise) from auction.bids where auction_id = a.id)
    from auction.auctions a where a.id = '${auctionId}'`).split("|");
  const seqOrderIncreasing = sql(`select bool_and(amount_paise > prev) from (
      select amount_paise, lag(amount_paise) over (order by seq) prev from auction.bids where auction_id = '${auctionId}') s where prev is not null`);
  return {
    current: Number(current),
    count: Number(count),
    maxAccepted: Number(maxAccepted),
    distinctAmounts: Number(distinctAmounts),
    seqOrderIncreasing,
  };
}

describe("Acceptance 8 — simultaneous bids", () => {
  it("everyone bids the same opening amount at once: exactly one is accepted", async () => {
    const results = await fire(Array.from({ length: BIDDERS }, () => 1000000));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => r.code === "BID_TOO_LOW")).toBe(true);
    const s = state();
    expect(s.count).toBe(1);
    expect(s.current).toBe(1000000);
  });

  it("a burst of different amounts: the highest valid bid is current; accepted bids strictly increase in server order", async () => {
    const amounts = Array.from({ length: BIDDERS * 3 }, (_, i) => 1010000 + ((i * 7919) % 40) * 10000);
    const results = await fire(amounts);
    const s = state();
    expect(s.current).toBe(s.maxAccepted);
    expect(s.distinctAmounts).toBe(s.count); // no amount accepted twice
    expect(s.seqOrderIncreasing).toBe("t"); // each accepted bid beat the previous one
    expect(results.filter((r) => !r.ok).every((r) => r.code === "BID_TOO_LOW")).toBe(true);
    expect(results.some((r) => r.ok && r.amount === s.current)).toBe(true);
  });

  it("the database's own record agrees with what bidders were told", async () => {
    const accepted = Number(
      sql(`select count(*) from auction.bids where auction_id = '${auctionId}' and status = 'ACCEPTED'`),
    );
    expect(accepted).toBe(state().count);
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const history = await anon.schema("api").rpc("auction_bid_history", { p_slug: slug });
    expect((history.data as unknown[]).length).toBe(Math.min(accepted, 50));
  });
});
