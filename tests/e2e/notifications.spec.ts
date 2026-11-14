import { expect, test } from "@playwright/test";
import {
  MAILPIT,
  becomeStaffWithMfa,
  createPoolFixture,
  readLocalEnv,
  registerAndConfirm,
  uniqueEmail,
} from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Notification journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
const customer = uniqueEmail("notify");

type MailSearch = { messages: { ID: string; Subject: string }[] };

async function runDeliveryJob(baseURL: string) {
  const res = await fetch(`${baseURL}/api/cron/notifications`, {
    headers: { authorization: `Bearer ${readLocalEnv("CRON_SECRET")}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { deliveries: { sent: number; failed: number; retry: number; skipped: number } };
}

/** Runs the delivery job until Mailpit has a message to `to` whose subject matches (older queued mail may go first). */
async function deliveredEmail(baseURL: string, to: string, subject: RegExp) {
  for (let i = 0; i < 8; i++) {
    await runDeliveryJob(baseURL);
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const found = ((await res.json()) as MailSearch).messages.find((m) => subject.test(m.Subject));
    if (found)
      return (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()) as { Text: string; HTML: string };
  }
  throw new Error(`no e-mail to ${to} matching ${subject}`);
}

test("a pool payment is notified in the app and by e-mail; the user manages read state and settings", async ({
  page,
  baseURL,
}) => {
  const unauthorized = await fetch(`${baseURL}/api/cron/notifications`, { headers: { authorization: "Bearer wrong" } });
  expect(unauthorized.status).toBe(401);

  const pool = createPoolFixture({ slug: `e2e-notify-${suffix}`, tiers: [[1, 1000]] });
  await registerAndConfirm(page, baseURL!, customer, "Nina Notify");

  await page.goto(`/poolx/pools/${pool.slug}`);
  await page.getByRole("button", { name: "Join pool" }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Payment confirmed — you’re in the pool.");

  // in-app inbox (reached from the user menu)
  await page.getByRole("button", { name: "Nina Notify" }).click();
  await page.getByRole("navigation", { name: "Account menu" }).getByRole("link", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/account\/notifications$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notifications");
  const list = page.getByRole("main").getByRole("list").last();
  await expect(list).toContainText(`You joined ${pool.title}`);
  await expect(list).toContainText("Contribution confirmed");
  await expect(list).toContainText(`We received your payment of ₹1,000 for ${pool.title}.`);
  await expect(page.getByRole("link", { name: /Unread \(\d+\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Mark “Contribution confirmed” as read" }).click();
  await expect(page.getByRole("button", { name: "Mark “Contribution confirmed” as read" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("link", { name: "Unread (0)" })).toBeVisible();
  await page.getByRole("link", { name: "Unread (0)" }).click();
  await expect(page.getByText("You’re all caught up")).toBeVisible();

  // e-mail copy through the delivery job (local Mailpit test inbox)
  const mail = await deliveredEmail(baseURL!, customer, /^Contribution confirmed — /);
  expect(mail.Text).toContain("Hello Nina Notify,");
  expect(mail.Text).toContain(`We received your payment of ₹1,000 for ${pool.title}.`);
  expect(mail.Text).toMatch(/View details: https?:\/\/[^\s]+\/account\/poolx/);
  expect(mail.Text).toContain("/account/notifications/preferences");

  // settings: essential notices are locked on; optional ones can be changed and are remembered
  await page.goto("/account/notifications/preferences");
  await expect(page.getByRole("checkbox", { name: "Contribution confirmed: e-mail" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Contribution confirmed: e-mail" })).toBeChecked();
  const outbidEmail = page.getByRole("checkbox", { name: "Outbid: e-mail" });
  await expect(outbidEmail).toBeChecked();
  await outbidEmail.uncheck();
  await page.getByRole("checkbox", { name: "New auctions: in app" }).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
  await expect(page.getByRole("checkbox", { name: "Outbid: e-mail" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "New auctions: in app" })).toBeChecked();
});

test("support staff see the delivery log; customers cannot", async ({ page, baseURL }) => {
  const staff = uniqueEmail("support");
  await registerAndConfirm(page, baseURL!, staff);
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "Notification deliveries" })).toHaveCount(0);
  await becomeStaffWithMfa(page, staff, "customer_support");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Notification deliveries" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notification deliveries");
  await page.getByLabel("Customer e-mail contains").fill(customer);
  await page.getByLabel("Status").selectOption("SENT");
  await page.getByRole("button", { name: "Filter" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Contribution confirmed" });
  await expect(row).toContainText(`to ${customer}`);
  await expect(row).toContainText("SENT");
  await expect(row).toContainText("mailpit");
});
