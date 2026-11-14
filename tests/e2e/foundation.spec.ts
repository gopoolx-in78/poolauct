import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = ["/", "/poolx", "/auctions", "/how-it-works", "/about", "/contact"];

test.describe("public pages", () => {
  for (const path of publicPages) {
    test(`${path} renders with one h1, unique metadata and no a11y violations`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);

      const title = await page.title();
      expect(title.length).toBeGreaterThan(10);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{50,}/);
      // Next.js emits the root canonical without a trailing slash (e.g. "https://example.com").
      const canonical = path === "/" ? /^https?:\/\/[^/]+\/?$/ : new RegExp(`^https?://[^/]+${path}$`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious,
        JSON.stringify(
          serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          null,
          2,
        ),
      ).toEqual([]);

      // No horizontal overflow
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("titles are unique across public pages", async ({ page }) => {
    const titles = new Set<string>();
    for (const path of publicPages) {
      await page.goto(path);
      titles.add(await page.title());
    }
    expect(titles.size).toBe(publicPages.length);
  });
});

test("no horizontal overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of publicPages) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("main navigation reaches every module page", async ({ page, isMobile }) => {
  await page.goto("/");
  for (const [label, path] of [
    ["PoolX", "/poolx"],
    ["Auctions", "/auctions"],
    ["How It Works", "/how-it-works"],
    ["About Us", "/about"],
    ["Contact Us", "/contact"],
  ] as const) {
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test("home has both module entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Explore PoolX — Join Buying Pools/ })).toHaveAttribute("href", "/poolx");
  await expect(page.getByRole("link", { name: /Explore Auctions — Discover and Bid/ })).toHaveAttribute(
    "href",
    "/auctions",
  );
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["cross-origin-resource-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("payment webhooks refuse oversized bodies, including chunked ones without a Content-Length", async ({
  baseURL,
}) => {
  const big = new Uint8Array(70 * 1024).fill(0x61);
  const url = `${baseURL}/api/webhooks/payments/sandbox`;
  const declared = await fetch(url, { method: "POST", body: big });
  expect(declared.status).toBe(413);
  const chunked = await fetch(url, {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (let i = 0; i < 7; i++) controller.enqueue(big.subarray(i * 10240, (i + 1) * 10240));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  expect(chunked.status).toBe(413);
  const wrongMethod = await fetch(url, { method: "GET" });
  expect(wrongMethod.status).toBe(405);
});

test("unknown routes return a branded 404", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("doesn");
});

test("robots, sitemap, manifest and health endpoints", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Sitemap:");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const p of ["/poolx", "/auctions", "/how-it-works"]) expect(sitemap).toContain(p);
  expect(sitemap).not.toContain("/admin");

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.checks.app).toBe("ok");
  expect(health.headers()["x-robots-tag"]).toContain("noindex");

  const icon = await request.get("/icon-192");
  expect(icon.headers()["content-type"]).toContain("image/png");
});
