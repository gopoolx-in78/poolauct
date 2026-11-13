import { expect, test, type Browser, type Page } from "@playwright/test";
import { becomeStaffWithMfa, readLocalEnv, registerAndConfirm, sql, uniqueEmail } from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Auction journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
const slug = `e2e-auction-${suffix}`;
const title = `E2E laptop lot ${suffix}`;

/** ISO instant → "YYYY-MM-DDTHH:mm" in IST for <input type="datetime-local">. */
const istLocal = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16);

async function newBidder(browser: Browser, baseURL: string, tag: string) {
  const page = await (await browser.newContext()).newPage();
  await registerAndConfirm(page, baseURL, uniqueEmail(tag), `Bidder ${tag}`);
  return page;
}

async function payDeposit(page: Page) {
  await page.goto(`/auctions/${slug}`);
  const panel = page.getByRole("complementary", { name: "Bidding" });
  // Bidding is not offered before the deposit is paid
  await expect(page.getByRole("button", { name: "Place bid" })).toHaveCount(0);
  await panel.getByRole("button", { name: /Pay refundable deposit ₹1,000/ }).click();
  await expect(panel.getByRole("alert")).toBeVisible(); // terms must be accepted first
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: /Pay refundable deposit ₹1,000/ }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\//);
  await expect(page.getByText("₹1,000").first()).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${slug}\\?payment=success`));
  await expect(page.getByText("Deposit confirmed — bidding is enabled for this auction.")).toBeVisible();
}

async function bid(page: Page, rupees: string) {
  await page.getByLabel("Your bid (₹)").fill(rupees);
  await page.getByRole("button", { name: "Place bid" }).click();
  await expect(page).toHaveURL(/\?bid=accepted/);
  await expect(page.getByText("Bid accepted.")).toBeVisible();
}

test("staff create and publish an auction; deposits, bids, close, refund and winner invoice", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  // Local seed configures a demo deposit policy (₹500 minimum); make sure it exists for this run.
  sql(
    `insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000'::jsonb) on conflict (key) do nothing`,
  );

  // --- Staff: create a draft, then publish (deposit frozen) ---
  const staffEmail = uniqueEmail("auction-staff");
  await registerAndConfirm(page, baseURL!, staffEmail, "Auction Staff");
  await becomeStaffWithMfa(page, staffEmail, "auction_manager");
  await page.goto("/admin/auctions/new");
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^URL slug/).fill(slug);
  await page.getByLabel(/^Category/).selectOption("laptops");
  await page.getByLabel(/^Brand/).fill("Generic");
  await page.getByLabel(/^Description/).fill("Ex-office laptop, working, light wear on the lid. Charger included.");
  await page.getByLabel(/^City/).fill("Pune");
  await page.getByLabel(/^State/).fill("Maharashtra");
  await page.getByLabel(/^Pickup/).fill("Collect from the warehouse within 7 days of payment.");
  await page.getByLabel(/^Additional charges/).fill("Handling fee: 250");
  await page.getByLabel(/^Starting price/).fill("10000");
  await page.getByLabel(/^Minimum increment/).fill("500");
  await page.getByLabel(/^Starts/).fill(istLocal(Date.now() - 60_000));
  await page.getByLabel(/^Ends/).fill(istLocal(Date.now() + 3 * 3600_000));
  await page.getByLabel(/^Deposit calculated as/).selectOption("FIXED");
  await page.getByLabel(/^Deposit amount/).fill("1000");
  await page
    .getByLabel(/^Deposit terms/)
    .fill("Refunded in full if you do not win. The winner's deposit is credited to the invoice.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish auction" }).click();
  await expect(page.getByText("Published. The deposit amount and terms are now frozen.")).toBeVisible();
  await expect(page.getByText("₹1,000").first()).toBeVisible();

  // --- Public page shows the mandatory deposit before sign-in ---
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/auctions/${slug}`);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(anon.getByText("Refundable deposit to bid:")).toContainText("₹1,000");
  await expect(anon.getByRole("link", { name: "Sign in to participate" })).toBeVisible();

  // --- Two bidders pay deposits and bid ---
  const a = await newBidder(browser, baseURL!, "bidder-a");
  await payDeposit(a);
  await bid(a, "10000");
  const b = await newBidder(browser, baseURL!, "bidder-b");
  await payDeposit(b);
  await bid(b, "10500");
  await a.reload();
  await expect(a.getByText(/you’ve been outbid/)).toBeVisible();

  // --- End time passes; the scheduled job closes the auction and refunds the loser ---
  sql(`update auction.auctions set ends_at = now() - interval '1 second' where slug = '${slug}'`);
  const cron = await page.request.get("/api/cron/auctions", {
    headers: { authorization: `Bearer ${readLocalEnv("CRON_SECRET")}` },
  });
  expect(cron.ok()).toBeTruthy();

  await a.goto("/account/auctions");
  const aDeposits = a.getByRole("table", { name: /auction participation deposits/ });
  await expect(aDeposits).toContainText(title);
  await expect(aDeposits).toContainText("Refunded");
  await expect(aDeposits).toContainText("₹1,000");

  // --- Winner pays the balance; the deposit is credited exactly once ---
  await b.goto("/account/auctions");
  const invoice = b.getByRole("table", { name: `Invoice for ${title}` });
  await expect(invoice).toContainText("₹10,500");
  await expect(invoice).toContainText("−₹1,000");
  await expect(invoice).toContainText("₹9,750"); // 10,500 + 250 − 1,000
  await b.getByRole("button", { name: "Pay ₹9,750" }).click();
  await expect(b).toHaveURL(/\/payments\/sandbox\//);
  await b.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(b).toHaveURL(/\/account\/auctions\?payment=success/);
  await expect(
    b.getByRole("region", { name: "Won auctions" }).getByRole("listitem").filter({ hasText: title }),
  ).toContainText("PAID");
  await expect(b.getByRole("table", { name: /auction participation deposits/ })).toContainText(
    "Credited ₹1,000 to your invoice",
  );

  expect(
    sql(`select count(*) from auction.deposit_adjustments da join auction.deposits d on d.id = da.deposit_id
         join auction.auctions x on x.id = d.auction_id where x.slug = '${slug}'`),
  ).toBe("1");
  expect(sql(`select sum(debit_paise) - sum(credit_paise) from ledger.entries`)).toBe("0");

  // --- Staff see the deposit dashboard ---
  await page.goto("/admin/auctions/deposits");
  await expect(page.getByRole("heading", { name: "Participation deposits" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Most recently updated deposits" })).toContainText(title);
});
