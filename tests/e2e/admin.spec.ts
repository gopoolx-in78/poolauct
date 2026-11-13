import { expect, test } from "@playwright/test";
import { becomeStaffWithMfa, registerAndConfirm, uniqueEmail } from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Admin journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

test("super admin: separated dashboard, suspend / reactivate a user, grant and revoke a role, audit trail", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const run = Date.now().toString(36);
  const suspendReason = `Repeated payment chargebacks under review ${run}`;
  const reactivateReason = `Chargebacks resolved with the bank ${run}`;
  const customerEmail = uniqueEmail("admin-target");
  const customer = await (await browser.newContext()).newPage();
  await registerAndConfirm(customer, baseURL!, customerEmail, "Target Customer");

  const adminEmail = uniqueEmail("super-admin");
  await registerAndConfirm(page, baseURL!, adminEmail, "Super Admin");
  await becomeStaffWithMfa(page, adminEmail, "super_admin");

  // Dashboard keeps PoolX and Auction figures in separate sections
  await expect(page.getByRole("heading", { name: "PoolX", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Auctions", level: 2 })).toBeVisible();
  await expect(page.getByText("Deposits held (liability)")).toBeVisible();

  // Find and suspend the customer
  await page.goto(`/admin/users?q=${encodeURIComponent(customerEmail)}`);
  await page.getByRole("link", { name: customerEmail }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(customerEmail);
  await page.getByLabel("Reason for suspending").fill(suspendReason);
  await page.getByRole("button", { name: "Suspend account" }).click();
  await expect(page.getByText("Account suspended. All of the user’s sessions were ended.")).toBeVisible();

  // The suspended customer is signed out and cannot use their account
  await customer.goto("/account");
  await expect(customer).toHaveURL(/\/login/);

  await page.getByLabel("Reason for reactivating").fill(reactivateReason);
  await page.getByRole("button", { name: "Reactivate account" }).click();
  await expect(page.getByText("Account reactivated.")).toBeVisible();

  // Grant, then revoke, a staff role
  await page.getByLabel("Grant role").selectOption("customer_support");
  await page.getByRole("textbox", { name: "Reason (recorded)" }).first().fill("Joining the support rota this month");
  await page.getByRole("button", { name: "Grant role" }).click();
  await expect(page.getByText("Role granted.")).toBeVisible();
  await page.getByLabel("Revoke role").selectOption("customer_support");
  await page.getByRole("textbox", { name: "Reason (recorded)" }).nth(1).fill("Support rota finished for now");
  await page.getByRole("button", { name: "Revoke role" }).click();
  await expect(page.getByText("Role revoked.")).toBeVisible();
  await expect(page.getByRole("table", { name: `Role history for ${customerEmail}` })).toContainText(
    "Support rota finished for now",
  );

  // Every step is in the append-only audit log
  await page.goto(`/admin/audit?action=user.`);
  await expect(page.getByText(suspendReason)).toBeVisible();
  await expect(page.getByText(reactivateReason)).toBeVisible();

  // Roles page shows the permission matrix
  await page.goto("/admin/roles");
  await expect(page.getByRole("table", { name: "Permissions granted to each staff role" })).toContainText(
    "roles.manage",
  );
});

test("finance manager: payments, refunds, balanced ledger per module and an audited CSV export; no user admin", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const email = uniqueEmail("finance");
  await registerAndConfirm(page, baseURL!, email, "Finance Staff");
  await becomeStaffWithMfa(page, email, "finance_manager");

  await page.goto("/admin/finance/payments");
  await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();
  await page.goto("/admin/finance/refunds");
  await expect(page.getByRole("heading", { name: "Refunds", level: 1 })).toBeVisible();

  for (const domain of ["poolx", "auction"]) {
    await page.goto(`/admin/finance/ledger?domain=${domain}`);
    const tb = page.getByRole("table", { name: /Trial balance for/ });
    await expect(tb).toContainText("balanced");
    await expect(tb).not.toContainText("NOT BALANCED");
    await expect(tb).not.toContainText(domain === "poolx" ? "auction:" : "poolx:");
  }

  const res = await page.request.get(
    `/admin/finance/exports/csv?kind=ledger&domain=auction&from=2026-01-01&to=${istToday()}`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("auction-ledger-");
  expect((await res.text()).split("\r\n")[0]).toMatch(/^entry_id,journal_id,posted_at,kind,/);

  // Finance has no user-suspension or role-management rights
  const users = await page.goto("/admin/roles");
  expect(users?.status()).toBe(200); // PPR: not-found UI is streamed (TD-23)
  await expect(page.getByRole("heading", { name: "Roles & permissions" })).toHaveCount(0);
});

test("CSV export is refused without the export permission", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("support");
  await registerAndConfirm(page, baseURL!, email, "Support Staff");
  await becomeStaffWithMfa(page, email, "customer_support");
  const res = await page.request.get(
    `/admin/finance/exports/csv?kind=payments&domain=poolx&from=2026-01-01&to=${istToday()}`,
  );
  expect(res.status()).toBe(404);
  await page.goto("/admin/finance/payments");
  await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toHaveCount(0);
});
