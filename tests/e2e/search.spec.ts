import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createPoolFixture } from "./support/helpers";

const suffix = Date.now().toString(36);

test("search finds open pools across the site, shows an empty state and is not indexed", async ({ page, isMobile }) => {
  const word = `zebrafoil${suffix}`;
  test.skip(isMobile, "fixture-creating test runs once, on desktop");
  createPoolFixture({ slug: `e2e-search-${suffix}`, title: `E2E ${word} kettle set` });

  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Search pools and auctions" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.getByRole("searchbox", { name: "Search pools and auctions" }).fill(word);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${word}$`));
  await expect(page.getByRole("status")).toHaveText(`1 result for “${word}”`);
  const pools = page.getByRole("region", { name: "Buying pools (1)" });
  await expect(pools.getByRole("heading", { name: `E2E ${word} kettle set` })).toBeVisible();
  await expect(page.getByRole("region", { name: /auctions/ })).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.goto(`/search?q=nothing-matches-${suffix}`);
  await expect(page.getByRole("status")).toHaveText(`0 results for “nothing-matches-${suffix}”`);
  await expect(page.getByText("Nothing matches yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "all pools" })).toHaveAttribute("href", "/poolx/pools");
});

test("search is reachable from the mobile menu", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile menu only");
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search");
  const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width).toBeLessThanOrEqual(0);
});
