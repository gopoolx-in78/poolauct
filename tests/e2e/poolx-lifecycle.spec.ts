import { expect, test, type Page } from "@playwright/test";
import {
  becomeStaffWithMfa,
  createPoolFixture,
  readLocalEnv,
  registerAndConfirm,
  sql,
  uniqueEmail,
} from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "lifecycle journey runs on desktop only (it creates accounts)");

async function joinAndPay(page: Page, slug: string) {
  await page.goto(`/poolx/pools/${slug}`);
  await page.getByRole("button", { name: "Join pool" }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Payment confirmed — you’re in the pool.");
}

test("close → negotiate → lock → price-adjustment refund → ship → deliver / dispute → complete", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString(36);
  const pool = createPoolFixture({
    slug: `e2e-lifecycle-${suffix}`,
    basePaise: 100000,
    minMembers: 2,
    targetMembers: 3,
    tiers: [[2, 1000]],
    sellerName: `Lifecycle Seller ${suffix}`,
  });

  // Two members join at ₹1,000 each (the 2-member tier only unlocks once both are confirmed)
  const a = await browser.newPage({ baseURL });
  await registerAndConfirm(a, baseURL!, uniqueEmail("lc-a"), `Member A ${suffix}`);
  await joinAndPay(a, pool.slug);
  const b = await browser.newPage({ baseURL });
  await registerAndConfirm(b, baseURL!, uniqueEmail("lc-b"), `Member B ${suffix}`);
  await joinAndPay(b, pool.slug);

  // Staff close joining, record an accepted ₹950 offer and lock: final = min(₹900 tier, ₹950 offer) = ₹900
  const staff = await browser.newPage({ baseURL });
  const staffEmail = uniqueEmail("lc-staff");
  await registerAndConfirm(staff, baseURL!, staffEmail);
  await becomeStaffWithMfa(staff, staffEmail, "poolx_manager");
  await staff.goto(`/admin/poolx/${pool.id}`);
  await staff.getByRole("button", { name: "Close joining now" }).click();
  await expect(staff.getByText("Joining closed.")).toBeVisible();

  await staff.getByRole("button", { name: "Lock pool and create orders" }).click();
  await expect(staff.getByRole("main").getByRole("alert")).toContainText("Tick the box");
  await staff.getByLabel(/offered price per unit/).fill("950");
  await staff.getByLabel(/^Terms/).fill("Seller confirms ₹950 per unit, dispatch within 5 days");
  await staff.getByLabel(/^Outcome/).selectOption("ACCEPTED");
  await staff.getByRole("button", { name: "Record negotiation" }).click();
  await expect(staff.getByText("Negotiation recorded.")).toBeVisible();
  await staff.getByLabel(/I confirm the seller has accepted/).check();
  await staff.getByRole("button", { name: "Lock pool and create orders" }).click();
  await expect(staff.getByText("Pool locked: orders created")).toBeVisible();
  const orders = staff.getByRole("table", { name: "Orders for this pool" });
  await expect(orders.getByRole("row")).toHaveCount(3); // header + 2 orders
  await expect(orders).toContainText("₹900");

  // The ₹100 difference is refunded once the provider confirms (refund worker)
  const cron = await request.get("/api/cron/poolx", {
    headers: { authorization: `Bearer ${readLocalEnv("CRON_SECRET")}` },
  });
  expect(cron.ok()).toBeTruthy();
  await a.goto("/account/poolx");
  const refunds = a.getByRole("table", { name: "Your PoolX refunds" });
  await expect(refunds).toContainText("Price dropped after you joined");
  await expect(refunds).toContainText("₹100");
  await expect(refunds).toContainText("Refunded");
  await expect(a.getByText("Order placed — awaiting dispatch")).toBeVisible();

  // Ship both orders
  for (const who of ["A", "B"]) {
    await staff.getByLabel(`Carrier for Member ${who} ${suffix}`).fill("BlueDart");
    await staff.getByLabel(`Tracking number for Member ${who} ${suffix}`).fill(`BD${who}${suffix}`);
    await staff.getByLabel(`Tracking link for Member ${who} ${suffix}`).fill("https://example.test/track");
    await staff
      .getByRole("row")
      .filter({ hasText: `Member ${who} ${suffix}` })
      .getByRole("button", { name: "Mark shipped" })
      .click();
    await expect(staff.getByText("Order marked as shipped.")).toBeVisible();
  }

  // Member A confirms delivery
  await a.goto("/account/poolx");
  await expect(a.getByRole("link", { name: `BDA${suffix}` })).toBeVisible();
  await a.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(a.getByRole("main").getByRole("status")).toHaveText("Thanks for confirming delivery.");
  await expect(a.getByText("Delivered", { exact: true })).toBeVisible();

  // Member B reports a problem; the manager resolves it without a refund (refunds need finance permission)
  await b.goto("/account/poolx");
  await b.getByRole("link", { name: "Report a problem…" }).click();
  await b.getByLabel("What went wrong?").fill(`The box arrived crushed but the item works (${suffix}).`);
  await b.getByRole("button", { name: "Report problem" }).click();
  await expect(b.getByRole("main").getByRole("status")).toContainText("We’ve received your report");

  await staff.goto("/admin/poolx/disputes");
  const dispute = staff
    .getByRole("listitem")
    .filter({ hasText: `The box arrived crushed but the item works (${suffix})` });
  await expect(dispute.getByRole("button", { name: "Refund", exact: true })).toHaveCount(0);
  await dispute.getByLabel(/Decision note/).fill("Courier damage only; item verified working with the member.");
  await dispute.getByRole("button", { name: "Resolve without refund" }).click();
  await expect(staff.getByText("Dispute resolved.")).toBeVisible();

  // Staff record delivery for B → every order finished → pool completes
  await staff.goto(`/admin/poolx/${pool.id}`);
  await staff.getByLabel(`Delivery evidence for Member B ${suffix}`).fill("Courier proof of delivery #123");
  await staff.getByRole("button", { name: "Mark delivered" }).click();
  await expect(staff.getByText("Order marked as delivered.")).toBeVisible();
  expect(sql(`select status from poolx.pools where id = '${pool.id}'`)).toBe("COMPLETED");

  await a.goto(`/poolx/pools/${pool.slug}`);
  await expect(a.getByText(/Deal locked at/)).toContainText("₹900");
  expect(
    sql(`select count(*) from core.audit_logs where entity_id = '${pool.id}'
         and action in ('poolx.pool.close_joining','poolx.negotiation.record','poolx.pool.lock')`),
  ).toBe("3");
});
