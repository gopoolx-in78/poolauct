import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { becomeStaffWithMfa, registerAndConfirm, signIn, uniqueEmail } from "./support/helpers";

/**
 * Phase 9 (1.16 / 7.10): accessibility (axe, WCAG 2.2 AA) and horizontal-overflow sweep of signed-in pages at
 * 320 / 768 / 1440 px. Public pages are covered by foundation.spec.ts.
 */
test.skip(({ isMobile }) => isMobile, "The sweep sets its own viewports; it runs once, on the desktop project");
test.describe.configure({ mode: "serial" });

const WIDTHS = [320, 768, 1440];

const accountPages = [
  "/account",
  "/account/profile",
  "/account/security",
  "/account/sessions",
  "/account/poolx",
  "/account/auctions",
  "/account/notifications",
  "/account/notifications/preferences",
  "/account/delete",
];

const adminPages = [
  "/admin",
  "/admin/users",
  "/admin/roles",
  "/admin/sellers",
  "/admin/notifications",
  "/admin/poolx",
  "/admin/poolx/new",
  "/admin/poolx/requests",
  "/admin/poolx/disputes",
  "/admin/auctions",
  "/admin/auctions/new",
  "/admin/auctions/deposits",
  "/admin/auctions/defaults",
  "/admin/auctions/policy",
  "/admin/theme",
  "/admin/theme/editor",
  "/admin/content?kind=PAGE",
  "/admin/content?kind=POST",
  "/admin/content/new",
  "/admin/content/faqs",
  "/admin/seo",
  "/admin/finance",
  "/admin/finance/payments",
  "/admin/finance/refunds",
  "/admin/finance/ledger",
  "/admin/finance/exports",
  "/admin/audit",
];

type Finding = { path: string; width: number; problem: string };

async function sweep(page: Page, paths: string[]) {
  const findings: Finding[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      const res = await page.goto(path);
      if (res?.status() !== 200) {
        findings.push({ path, width, problem: `HTTP ${res?.status()}` });
        continue;
      }
      // Pages stream behind Suspense: wait for loading placeholders to clear rather than for network idle (some pages
      // keep connections open).
      await expect(page.locator("main .animate-pulse")).toHaveCount(0, { timeout: 20_000 });
      if ((await page.locator("h1").count()) !== 1) findings.push({ path, width, problem: "expected exactly one h1" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) findings.push({ path, width, problem: `horizontal overflow ${overflow}px` });
      // Colour contrast does not depend on width; run axe once per page, at the widest viewport.
      if (width === 1440) {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        for (const v of results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"))
          findings.push({ path, width, problem: `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}` });
      }
    }
  }
  return findings;
}

const email = uniqueEmail("a11y");

test("signed-in account pages have no serious a11y violations or horizontal overflow", async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  await registerAndConfirm(page, baseURL!, email);
  const findings = await sweep(page, accountPages);
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});

test("admin pages have no serious a11y violations or horizontal overflow", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/account/);
  await becomeStaffWithMfa(page, email, "super_admin");
  const findings = await sweep(page, adminPages);
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});
