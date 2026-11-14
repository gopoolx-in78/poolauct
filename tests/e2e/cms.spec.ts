import { expect, test } from "@playwright/test";
import { becomeStaffWithMfa, registerAndConfirm, sql, uniqueEmail } from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Theme / CMS journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);

test("super admin: edit a draft with live validation, publish it, then restore the previous design", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("theme-admin");
  await registerAndConfirm(page, baseURL!, email, "Theme Admin");
  await becomeStaffWithMfa(page, email, "super_admin");

  // Version A: the current design, re-published unchanged (the baseline to restore later)
  await page.goto("/admin/theme");
  await page.getByRole("link", { name: /Start a draft|Continue editing/ }).click();
  await expect(page.getByRole("heading", { name: "Edit design", level: 1 })).toBeVisible();
  const baselineHeading = await page.getByRole("textbox", { name: /^Heading/ }).inputValue();
  await page.getByLabel("Version name").fill(`Baseline ${run}`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.goto("/admin/theme");
  await page.getByLabel("What changed (recorded)").fill("Baseline design for the e2e run");
  await page.getByRole("button", { name: "Publish draft" }).click();
  await expect(page.getByText("Draft published. The public site now uses this design.")).toBeVisible();
  const versionA = sql(`select id from cms.theme_versions where status = 'PUBLISHED'`);

  // Version B: the editor blocks unsafe links before saving, then publishes a new heading
  await page.goto("/admin/theme/editor");
  await page.getByLabel("Menu link 1 path").fill("javascript:alert(1)");
  await expect(page.getByRole("alert").filter({ hasText: "Fix these before saving" })).toContainText(
    "Links must be internal paths",
  );
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await page.getByLabel("Menu link 1 path").fill("/");
  const heading = `Better prices together ${run}`;
  await page.getByRole("textbox", { name: /^Heading/ }).fill(heading);
  await expect(page.getByRole("region", { name: /Preview of the draft design/ })).toContainText(heading);
  await page.getByLabel("Version name").fill(`New heading ${run}`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.goto("/admin/theme");
  await page.getByLabel("What changed (recorded)").fill("Testing a clearer homepage heading");
  await page.getByRole("button", { name: "Publish draft" }).click();
  await expect(page.getByText("Draft published. The public site now uses this design.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);

  // Roll back to version A
  await page.goto("/admin/theme");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: `Restore version ${versionA}` }) });
  await row.getByLabel("Reason (recorded)").fill("Reverting the heading experiment");
  await row.getByRole("button", { name: `Restore version ${versionA}` }).click();
  await expect(page.getByText("Earlier design restored and published as a new version.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(baselineHeading);

  // Audited
  expect(
    Number(
      sql(`select count(*) from core.audit_logs where action in ('cms.theme.published', 'cms.theme.rolled_back')
      and created_at > now() - interval '10 minutes'`),
    ),
  ).toBeGreaterThanOrEqual(3);
});

test("content manager: a blog post with script and javascript: links is published as harmless text; FAQs; no theme publishing", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("content");
  await registerAndConfirm(page, baseURL!, email, "Content Manager");
  await becomeStaffWithMfa(page, email, "content_manager");

  const slug = `e2e-post-${run}`;
  await page.goto("/admin/content/new?kind=POST");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Pooling tips ${run}`);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Summary", { exact: true }).fill("A short test article");
  await page
    .getByRole("textbox", { name: "Content", exact: true })
    .fill(
      '## Tips\n\nJoin early. <script>window.__xss = 1</script> <img src=x onerror="window.__xss = 2">\n\n[click me](javascript:window.__xss=3) and [our pools](/poolx).',
    );
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Saved as a new revision.")).toBeVisible();

  // Not public until published
  const anon = await (await browser.newContext()).newPage();
  const draft = await anon.goto(`/blog/${slug}`);
  expect(draft?.status()).toBe(200); // PPR: not-found UI is streamed (TD-23)
  await expect(anon.getByRole("heading", { name: `Pooling tips ${run}` })).toHaveCount(0);

  await page.getByRole("button", { name: "Publish revision 1" }).click();
  await expect(page.getByText("Published. Visitors now see this revision.")).toBeVisible();

  await anon.goto(`/blog/${slug}`);
  await expect(anon.getByRole("heading", { name: `Pooling tips ${run}`, level: 1 })).toBeVisible();
  await expect(anon.getByRole("heading", { name: "Tips", level: 2 })).toBeVisible();
  await expect(anon.getByText("click me")).toBeVisible();
  await expect(anon.getByRole("link", { name: "click me" })).toHaveCount(0);
  await expect(anon.getByRole("link", { name: "our pools" })).toHaveAttribute("href", "/poolx");
  await expect(anon.locator("article img, article script")).toHaveCount(0);
  expect(await anon.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await anon.goto("/blog");
  await expect(anon.getByRole("link", { name: `Pooling tips ${run}` })).toBeVisible();

  // FAQ
  const question = `Can I withdraw from a pool ${run}?`;
  await page.goto("/admin/content/faqs");
  const form = page.getByRole("region", { name: "New question" });
  await form.getByLabel("Topic").selectOption("poolx");
  await form.getByLabel("Visibility").selectOption("PUBLISHED");
  await form.getByLabel("Question", { exact: true }).fill(question);
  await form.getByLabel(/^Answer/).fill("Yes, before the pool locks, following the pool’s published withdrawal rules.");
  await form.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await anon.goto("/faq");
  await expect(anon.getByText(question)).toBeVisible();

  // Content managers may edit theme drafts but not publish them
  await page.goto("/admin/theme");
  await expect(page.getByRole("heading", { name: "Theme & homepage", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish draft" })).toHaveCount(0);
});

test("customers cannot reach the theme or content admin", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await registerAndConfirm(page, baseURL!, uniqueEmail("cms-customer"));
  for (const path of ["/admin/theme", "/admin/theme/editor", "/admin/content", "/admin/seo"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /Theme & homepage|Edit design|Pages|SEO/, level: 1 })).toHaveCount(
      0,
    );
  }
});
