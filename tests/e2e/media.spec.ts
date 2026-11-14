import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { becomeStaffWithMfa, readLocalEnv, registerAndConfirm, sql, uniqueEmail } from "./support/helpers";

test.skip(({ isMobile }) => isMobile, "Media journeys run on desktop only (they create accounts)");
test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
const slug = `e2e-media-${suffix}`;
const title = `E2E photo pool ${suffix}`;

const photo = (r: number, g: number, b: number) =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: { r, g, b } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "E2E owner" } } })
    .toBuffer();

test("staff upload, caption, re-order and remove pool photos; the public page shows them", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const poolId = sql(`insert into poolx.pools (slug, title, summary, product_name, category_id, base_unit_price_paise,
      min_qty_per_member, max_qty_per_member, min_members, target_members, deadline_at)
    values ('${slug}', '${title}', 'Pool created by the media end-to-end test', 'Test product',
      (select id from poolx.categories where slug = 'electronics'), 100000, 1, 3, 1, 5, now() + interval '3 days')
    returning id`).split("\n")[0]!;

  const staffEmail = uniqueEmail("media-staff");
  await registerAndConfirm(page, baseURL!, staffEmail, "Media Staff");
  await becomeStaffWithMfa(page, staffEmail, "poolx_manager");
  await page.goto(`/admin/poolx/${poolId}`);
  const photos = page.getByRole("region", { name: "Photos" });
  const upload = photos.getByRole("form", { name: "Add a photo" });
  await expect(photos.getByText("No photos yet.")).toBeVisible();

  // A file that only pretends to be a JPEG is refused by its content, not its name.
  await upload.getByLabel(/^Photo/).setInputFiles({
    name: "cat.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await upload.getByLabel(/^Alt text/).fill("Not really a photo");
  await upload.getByRole("button", { name: "Upload photo" }).click();
  await expect(upload.getByRole("alert")).toHaveText("Upload a JPEG, PNG or WebP photo.");

  for (const [alt, colour] of [
    ["Red front panel of the widget", [200, 40, 40]],
    ["Blue side view of the widget", [40, 40, 200]],
  ] as const) {
    await upload.getByLabel(/^Photo/).setInputFiles({
      name: "widget.jpg",
      mimeType: "image/jpeg",
      buffer: await photo(colour[0], colour[1], colour[2]),
    });
    await upload.getByLabel(/^Alt text/).fill(alt);
    await upload.getByRole("button", { name: "Upload photo" }).click();
    await expect(upload.getByRole("status")).toHaveText("Photo added.");
    await expect(photos.getByRole("img", { name: alt })).toBeVisible();
  }

  await photos.getByRole("button", { name: "Move up: Blue side view of the widget" }).click();
  await expect(page.getByText("Photo order updated.")).toBeVisible();
  await expect(photos.getByRole("img").first()).toHaveAttribute("alt", "Blue side view of the widget");

  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await photos.getByRole("button", { name: "Remove: Red front panel of the widget" }).click();
  await expect(page.getByText("Photo removed.")).toBeVisible();
  await expect(photos.getByRole("img")).toHaveCount(1);
  expect(
    sql(
      `select count(*) from core.media_assets m join poolx.pool_media l on l.media_id = m.id where l.pool_id = '${poolId}'`,
    ),
  ).toBe("1");

  // Publish, then the public page shows the remaining photo, served as WebP without metadata.
  sql(`update poolx.pools set status = 'ACTIVE', published_at = now() where id = '${poolId}'`);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/poolx/pools/${slug}`);
  const hero = anon.getByRole("region", { name: `Photos of ${title}` }).getByRole("img", {
    name: "Blue side view of the widget",
  });
  await expect(hero).toBeVisible();
  // The browser actually loaded it (CSP img-src allows the Supabase origin).
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200);
  const src = (await hero.getAttribute("src"))!;
  expect(src).toMatch(/\/storage\/v1\/object\/public\/public-media\/[0-9a-f-]{36}\/display\.webp$/);
  const res = await anon.request.get(src);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/webp");
  const meta = await sharp(await res.body()).metadata();
  expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 1200, 900, undefined]);

  // The pool list card uses the first photo as its cover.
  await anon.goto(`/poolx/pools?q=${encodeURIComponent(title)}`);
  await expect(anon.getByRole("img", { name: "Blue side view of the widget" })).toBeVisible();
});

test("uploads are refused cross-site, without a staff session, and directly against Storage", async ({
  request,
  baseURL,
}) => {
  const form = { target: "pool", id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", alt: "Anything at all" };
  const crossSite = await request.post("/api/media", { multipart: form, headers: { origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
  const anonymous = await request.post("/api/media", {
    multipart: form,
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(anonymous.status()).toBe(403);

  // Clients holding the public anon key cannot write to the bucket.
  const supabaseUrl = readLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readLocalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const direct = await request.post(`${supabaseUrl}/storage/v1/object/public-media/e2e-${suffix}/display.webp`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "image/webp" },
    data: Buffer.from("RIFF0000WEBPVP8 "),
  });
  expect(direct.status()).toBeGreaterThanOrEqual(400);
});

test("content managers set, replace and remove a blog cover; the post and blog list show it", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("cover-staff");
  await registerAndConfirm(page, baseURL!, email, "Cover Staff");
  await becomeStaffWithMfa(page, email, "content_manager");
  const postSlug = `e2e-cover-${suffix}`;
  const postTitle = `E2E cover post ${suffix}`;
  const profile = sql(`select id from core.profiles where email = '${email}'`);
  const docId =
    sql(`insert into cms.documents (kind, slug, status, latest_revision, published_revision, first_published_at,
      published_at, created_by, updated_by)
    values ('POST', '${postSlug}', 'PUBLISHED', 1, 1, now(), now(), '${profile}', '${profile}') returning id`).split(
      "\n",
    )[0]!;
  sql(`insert into cms.document_revisions (document_id, revision, title, summary, body, created_by)
    values ('${docId}', 1, '${postTitle}', 'A post used by the cover test', 'Body text for the cover test.', '${profile}')`);

  await page.goto(`/admin/content/${docId}`);
  const section = page.getByRole("region", { name: "Cover image" });
  const upload = section.getByRole("form", { name: "Add a photo" });
  await expect(section.getByText("No cover image.")).toBeVisible();

  const setCover = async (alt: string, colour: [number, number, number], button: string) => {
    await upload
      .getByLabel(/^Photo/)
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: await photo(...colour) });
    await upload.getByLabel(/^Alt text/).fill(alt);
    await upload.getByRole("button", { name: button }).click();
    await expect(upload.getByRole("status")).toHaveText("Cover saved.");
    await expect(section.getByRole("img", { name: alt })).toBeVisible();
    return (await section.getByRole("img", { name: alt }).getAttribute("src"))!;
  };
  const first = await setCover("Green packing table", [40, 160, 60], "Upload cover");
  const second = await setCover("Stack of delivered boxes", [160, 120, 40], "Replace cover");
  expect(second).not.toBe(first);
  // the replaced cover's files are deleted from Storage
  expect((await page.request.get(first)).status()).toBeGreaterThanOrEqual(400);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/blog/${postSlug}`);
  const hero = anon.getByRole("article").getByRole("img", { name: "Stack of delivered boxes" });
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200);
  await expect(anon.locator('meta[property="og:image"]')).toHaveAttribute("content", /display\.webp$/);
  await anon.goto("/blog");
  await expect(anon.getByRole("img", { name: "Stack of delivered boxes" })).toBeVisible();

  await section.getByRole("button", { name: "Remove cover: Stack of delivered boxes" }).click();
  await expect(page.getByText("Cover image removed.")).toBeVisible();
  await anon.goto(`/blog/${postSlug}`);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText(postTitle);
  await expect(anon.getByRole("article").getByRole("img")).toHaveCount(0);
});
