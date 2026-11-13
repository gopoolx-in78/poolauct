import { expect, test } from "@playwright/test";
import {
  becomeStaffWithMfa,
  createPoolFixture,
  readLocalEnv,
  registerAndConfirm,
  signSandboxEvent,
  sql,
  uniqueEmail,
} from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "PoolX journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);

test("public pages show a published pool with live numbers; anonymous users are asked to sign in", async ({ page }) => {
  const pool = createPoolFixture({
    slug: `e2e-public-${suffix}`,
    tiers: [
      [2, 1000],
      [4, 2000],
    ],
  });

  await page.goto(`/poolx/pools?q=${encodeURIComponent(pool.title)}`);
  const card = page.getByRole("article").filter({ hasText: pool.title });
  await expect(card).toBeVisible();
  await expect(card.getByText("₹1,000")).toBeVisible();
  await expect(card.getByText(/0\s*\/ 5 members/)).toBeVisible();

  await card.getByRole("link", { name: /View and join/ }).click();
  await expect(page).toHaveURL(new RegExp(`/poolx/pools/${pool.slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(pool.title);
  await expect(page.getByRole("table", { name: /Discount tiers/ })).toContainText("₹900");
  await expect(page.getByRole("link", { name: "Sign in to join" })).toBeVisible();
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  const product = jsonLd.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Product");
  expect(product?.offers).toMatchObject({
    priceCurrency: "INR",
    price: "1000.00",
    availability: "https://schema.org/InStock",
  });
});

test("join → test checkout → verified payment makes the user a member; price follows confirmed members", async ({
  page,
  baseURL,
}) => {
  const pool = createPoolFixture({ slug: `e2e-join-${suffix}`, tiers: [[1, 1000]] });
  await registerAndConfirm(page, baseURL!, uniqueEmail("join"));

  await page.goto(`/poolx/pools/${pool.slug}`);
  await page.getByLabel(/Quantity/).selectOption("2");
  await expect(page.getByText("Estimated contribution")).toBeVisible();
  await page.getByRole("button", { name: "Join pool" }).click();

  await expect(page).toHaveURL(/\/payments\/sandbox\//);
  await expect(page.getByRole("note")).toContainText("No real money moves");
  await expect(page.getByText("₹2,000")).toBeVisible(); // 2 × ₹1,000: first member, tier not reached yet
  await page.getByRole("button", { name: "Simulate successful payment" }).click();

  await expect(page).toHaveURL(new RegExp(`/poolx/pools/${pool.slug}\\?payment=success`));
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Payment confirmed — you’re in the pool.");
  await expect(page.getByText(/1\s*\/ 5 members/).first()).toBeVisible();
  await expect(page.getByText("₹900").first()).toBeVisible(); // 1-member tier now unlocked for the next joiner

  await page.goto("/account/poolx");
  const row = page.getByRole("listitem").filter({ hasText: pool.title });
  await expect(row).toContainText("Member");
  await expect(row).toContainText("Confirmed");
});

test("a failed payment can be retried without a duplicate membership", async ({ page, baseURL }) => {
  const pool = createPoolFixture({ slug: `e2e-fail-${suffix}` });
  const email = uniqueEmail("fail");
  await registerAndConfirm(page, baseURL!, email);

  await page.goto(`/poolx/pools/${pool.slug}`);
  await page.getByRole("button", { name: "Join pool" }).click();
  await page.getByRole("button", { name: "Simulate failed payment" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The payment didn’t go through. You can try again.",
  );

  await page.getByRole("button", { name: /Join pool|Continue to payment/ }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Payment confirmed — you’re in the pool.");

  const counts =
    sql(`select count(*) || ',' || count(*) filter (where c.status = 'FAILED') || ',' || count(*) filter (where c.status = 'CONFIRMED')
    from poolx.contributions c join core.profiles p on p.id = c.user_id where p.email = '${email}'`);
  expect(counts).toBe("2,1,1");
  expect(
    sql(`select count(*) from poolx.members m join core.profiles p on p.id = m.user_id where p.email = '${email}'`),
  ).toBe("1");
});

test("webhook endpoint: verified once, duplicate is a no-op, forged and stale events rejected", async ({
  page,
  baseURL,
  request,
}) => {
  const pool = createPoolFixture({ slug: `e2e-hook-${suffix}` });
  const email = uniqueEmail("hook");
  await registerAndConfirm(page, baseURL!, email);
  await page.goto(`/poolx/pools/${pool.slug}`);
  await page.getByRole("button", { name: "Join pool" }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\//);

  const [orderId, amount] = sql(`select a.provider_order_id || '|' || a.amount_paise from core.payment_attempts a
    join core.profiles p on p.id = a.user_id where p.email = '${email}' and a.status = 'PENDING'`).split("|");
  const secret = readLocalEnv("SANDBOX_WEBHOOK_SECRET");
  const event = {
    id: `evt_${suffix}`,
    type: "payment.captured",
    order_id: orderId,
    payment_id: `pay_${suffix}`,
    refund_id: null,
    amount,
    currency: "INR",
  };

  const forged = signSandboxEvent(event, "f".repeat(64));
  expect(
    (await request.post("/api/webhooks/payments/sandbox", { data: forged.body, headers: forged.headers })).status(),
  ).toBe(400);

  const stale = signSandboxEvent(event, secret, Math.floor(Date.now() / 1000) - 3600);
  expect(
    (await request.post("/api/webhooks/payments/sandbox", { data: stale.body, headers: stale.headers })).status(),
  ).toBe(400);

  const good = signSandboxEvent(event, secret);
  const first = await request.post("/api/webhooks/payments/sandbox", { data: good.body, headers: good.headers });
  expect(await first.json()).toMatchObject({ result: "CONTRIBUTION_CONFIRMED" });
  const second = await request.post("/api/webhooks/payments/sandbox", { data: good.body, headers: good.headers });
  expect(await second.json()).toMatchObject({ result: "DUPLICATE" });

  expect((await request.post("/api/webhooks/payments/unknown", { data: "{}" })).status()).toBe(404);
  expect(
    sql(`select count(*) from ledger.journals j join poolx.contributions c on c.id = j.reference_id
    join core.profiles p on p.id = c.user_id where p.email = '${email}'`),
  ).toBe("1");
});

test("withdrawing refunds the full contribution once the provider confirms", async ({ page, baseURL, request }) => {
  const pool = createPoolFixture({ slug: `e2e-withdraw-${suffix}` });
  await registerAndConfirm(page, baseURL!, uniqueEmail("withdraw"));
  await page.goto(`/poolx/pools/${pool.slug}`);
  await page.getByRole("button", { name: "Join pool" }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("you’re in");

  await page.goto("/account/poolx");
  const row = page.getByRole("listitem").filter({ hasText: pool.title });
  await row.getByRole("link", { name: "Withdraw…" }).click();
  await page.getByRole("button", { name: "Withdraw from pool" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("tick the confirmation");
  await page.getByRole("listitem").filter({ hasText: pool.title }).getByRole("link", { name: "Withdraw…" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Withdraw from pool" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("refunded in full");
  await expect(page.getByRole("table", { name: "Your PoolX refunds" })).toContainText("Queued");

  const cron = readLocalEnv("CRON_SECRET");
  expect((await request.get("/api/cron/poolx")).status()).toBe(401);
  const run = await request.get("/api/cron/poolx", { headers: { authorization: `Bearer ${cron}` } });
  expect(run.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("table", { name: "Your PoolX refunds" })).toContainText("Refunded");
  await expect(page.getByRole("table", { name: "Your PoolX refunds" })).toContainText("₹1,000");
});

test("staff create a draft pool, set tiers and publish it; it then appears publicly", async ({ page, baseURL }) => {
  const email = uniqueEmail("pmgr");
  await registerAndConfirm(page, baseURL!, email);
  await becomeStaffWithMfa(page, email, "poolx_manager");

  await page.getByRole("link", { name: "Pools", exact: true }).click();
  await page.getByRole("link", { name: "New pool" }).click();
  const slug = `e2e-admin-${suffix}`;
  await page.getByLabel(/^Title/).fill("Admin-made cement pool");
  await page.getByLabel(/^URL slug/).fill(slug);
  await page.getByLabel(/^Summary/).fill("OPC 53 cement for housing societies");
  await page.getByLabel(/^Product name/).fill("OPC 53 cement");
  await page.getByLabel(/^Category/).selectOption("cement-and-steel");
  await page.getByLabel(/^Base price per unit/).fill("380");
  await page.getByLabel(/^Unit label/).fill("bag");
  await page.getByLabel(/^Max quantity per member/).fill("50");
  await page.getByLabel(/^Specifications/).fill("Grade: OPC 53\nBag: 50 kg");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved.");

  await page.getByLabel("Tier 1 threshold").fill("5");
  await page.getByLabel("Tier 1 discount percent").fill("10");
  await page.getByLabel("Tier 2 threshold").fill("10");
  await page.getByLabel("Tier 2 discount percent").fill("5");
  await page.getByRole("button", { name: "Save tiers" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("bigger discount");
  await page.getByLabel("Tier 2 discount percent").fill("15");
  await page.getByRole("button", { name: "Save tiers" }).click();
  await expect(page.getByText("Saved 2 tiers.")).toBeVisible();

  await page.getByRole("button", { name: "Publish pool" }).click();
  await expect(page.getByText("Published — the pool is now open.")).toBeVisible();

  await page.goto(`/poolx/pools/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin-made cement pool");
  await expect(page.getByText("₹342").first()).toBeVisible(); // 380 − 10% at 5 members (tier row)
  expect(
    sql(`select count(*) from core.audit_logs where action in ('poolx.pool.create','poolx.tiers.set','poolx.pool.publish')
    and entity_id = (select id::text from poolx.pools where slug = '${slug}')`),
  ).toBe("3");
});

test("customers can request a custom pool; reviewers see and decide it", async ({ page, baseURL, browser }) => {
  await registerAndConfirm(page, baseURL!, uniqueEmail("req"));
  await page.goto("/poolx/request");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("A title is required.")).toBeVisible();
  await page.getByLabel(/^Request title/).fill(`Society water purifiers ${suffix}`);
  await page.getByLabel(/^Product or service/).fill("RO water purifier");
  await page.getByLabel(/^What do you need/).fill("About 40 purifiers for our housing society, installation included.");
  await page.getByLabel(/^Expected price per unit/).fill("9,500");
  await page.getByLabel(/^Delivery location/).fill("Thane 400601");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/notice=request-submitted/);
  await expect(page.getByText(`Society water purifiers ${suffix}`)).toBeVisible();

  const staff = await browser.newPage({ baseURL });
  const email = uniqueEmail("reviewer");
  await registerAndConfirm(staff, baseURL!, email);
  await becomeStaffWithMfa(staff, email, "poolx_manager");
  await staff.goto("/admin/poolx/requests");
  const item = staff.getByRole("listitem").filter({ hasText: `Society water purifiers ${suffix}` });
  await expect(item).toContainText("₹9,500");
  await item.getByLabel("Note to requester").fill("We'll set this up next week.");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(staff.getByText("Decision saved.")).toBeVisible();
  await staff.close();

  await page.reload();
  await expect(page.getByText("We'll set this up next week.")).toBeVisible();
});

test("pool pages are in the sitemap; account/admin PoolX pages are not indexable", async ({ page, request }) => {
  createPoolFixture({ slug: `e2e-sitemap-${suffix}` });
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/poolx/pools/e2e-sitemap-${suffix}`);
  expect(sitemap).toContain("/poolx/categories/electronics");
  expect(sitemap).not.toContain("/account");
  await page.goto("/poolx/pools");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/poolx\/pools$/);
});
