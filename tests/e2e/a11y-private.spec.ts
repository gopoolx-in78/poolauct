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
  "/admin/content/featured",
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
  // Switching light → dark on a loaded page starts the buttons' colour transitions; with reduced motion the site sets
  // them to ~0 ms, so axe measures the final colours instead of a mid-fade frame (seen once on /admin/theme).
  await page.emulateMedia({ reducedMotion: "reduce" });
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
      // The page's content can still be streaming in just after the placeholder clears (seen once on /admin/roles at
      // 320 px): allow it to settle, then require exactly one h1.
      try {
        await expect(page.locator("h1")).toHaveCount(1, { timeout: 10_000 });
      } catch {
        findings.push({ path, width, problem: `expected exactly one h1, found ${await page.locator("h1").count()}` });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) findings.push({ path, width, problem: `horizontal overflow ${overflow}px` });
      // Colour contrast does not depend on width; run axe at the widest viewport, in light and in dark mode.
      if (width === 1440) {
        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme });
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          for (const v of results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"))
            findings.push({
              path,
              width,
              problem: `${colorScheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
            });
        }
        await page.emulateMedia({ colorScheme: "light" });
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
