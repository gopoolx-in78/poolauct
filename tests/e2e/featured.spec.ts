import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { becomeStaffWithMfa, createPoolFixture, registerAndConfirm, sql, uniqueEmail } from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Featured journeys run on desktop only (they create accounts)");

test("content managers feature open pools on the homepage, re-order and remove them", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  // Earlier runs leave featured e2e rows behind; start from a clean list (max 6 per marketplace).
  sql(`delete from cms.featured_listings where slug like 'e2e-%'`);
  const suffix = Date.now().toString(36);
  const first = createPoolFixture({ slug: `e2e-feat-a-${suffix}`, title: `Featured pool A ${suffix}` });
  const second = createPoolFixture({ slug: `e2e-feat-b-${suffix}`, title: `Featured pool B ${suffix}` });
  const closed = createPoolFixture({ slug: `e2e-feat-c-${suffix}`, title: `Featured pool C ${suffix}` });
  sql(`update poolx.pools set status = 'THRESHOLD_MET' where slug = '${closed.slug}'`);

  const email = uniqueEmail("featured-staff");
  await registerAndConfirm(page, baseURL!, email, "Feature Staff");
  await becomeStaffWithMfa(page, email, "content_manager");
  await page.goto("/admin/content/featured");
  const form = page.getByRole("form", { name: "Feature a listing" });
  for (const slug of [first.slug, second.slug, closed.slug]) {
    await form.getByLabel(/^Listing web address name/).fill(slug);
    await form.getByRole("button", { name: "Feature" }).click();
    await expect(page.getByRole("button", { name: `Remove from featured: ${slug}` })).toBeVisible();
  }
  await form.getByLabel(/^Listing web address name/).fill(first.slug);
  await form.getByRole("button", { name: "Feature" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("that listing is already featured");

  const pools = page.getByRole("region", { name: /^PoolX pools/ });
  await expect(pools.getByRole("listitem")).toHaveCount(3);
  await expect(pools.getByRole("listitem").nth(2)).toContainText("Not shown");
  await expect(pools.getByRole("link", { name: first.title })).toBeVisible();

  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  // The homepage shows only the open pools, in the chosen order.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  const featured = anon.getByRole("region", { name: "Open now" });
  await expect(featured.getByRole("heading", { name: first.title })).toBeVisible();
  await expect(featured.getByRole("heading", { name: closed.title })).toHaveCount(0);
  await expect(featured.getByRole("listitem").first()).toContainText(first.title);

  await pools.getByRole("button", { name: `Move up: ${second.slug}` }).click();
  await expect(page.getByText("Order updated.")).toBeVisible();
  await anon.reload();
  await expect(anon.getByRole("region", { name: "Open now" }).getByRole("listitem").first()).toContainText(
    second.title,
  );

  for (const slug of [first.slug, second.slug, closed.slug]) {
    await page.getByRole("button", { name: `Remove from featured: ${slug}` }).click();
    await expect(page.getByRole("button", { name: `Remove from featured: ${slug}` })).toHaveCount(0);
  }
  await anon.reload();
  await expect(anon.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(anon.getByRole("region", { name: "Open now" })).toHaveCount(0);
  // three additions and three removals are in the audit log
  expect(
    sql(`select count(*) from core.audit_logs where action in ('cms.featured.add', 'cms.featured.remove')
      and coalesce(after, before) ->> 'slug' like 'e2e-feat-%-${suffix}'`),
  ).toBe("6");
});
