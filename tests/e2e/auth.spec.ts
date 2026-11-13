import { expect, test } from "@playwright/test";
import {
  emailLink,
  onApp,
  register,
  registerAndConfirm,
  signIn,
  sql,
  STRONG_PASSWORD,
  totp,
  uniqueEmail,
} from "./support/helpers";

// Auth journeys create real accounts in the local database; run them once (desktop) to stay within auth rate limits.
test.skip(({ isMobile }) => isMobile, "auth journeys run on desktop only");
test.describe.configure({ mode: "serial" });

test("sign-up requires email confirmation, then signs the user in", async ({ page, baseURL }) => {
  const email = uniqueEmail("signup");
  await register(page, email, "Asha Rao");

  // Cannot sign in before confirming
  await signIn(page, email);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("confirm your email");

  const link = await emailLink(email, /Confirm your email/);
  await page.goto(onApp(link, baseURL!));
  await expect(page).toHaveURL(/\/account\?notice=email-confirmed/);
  await expect(page.getByRole("main").getByRole("status")).toContainText("email address is confirmed");
  await expect(page.getByRole("button", { name: /Asha Rao/ })).toBeVisible();

  // Confirmation links are single-use
  await page.goto(onApp(link, baseURL!));
  await expect(page).toHaveURL(/\/login\?error=link/);
});

test("registration does not reveal whether an email is already registered", async ({ page, baseURL }) => {
  const email = uniqueEmail("dupe");
  await registerAndConfirm(page, baseURL!, email);
  await page.context().clearCookies();
  await register(page, email); // same outcome as a brand-new address
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("validation errors are shown inline and keep entered values", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Ravi");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel(/^Password/).fill("weak");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText(/Use at least 10 characters/)).toBeVisible();
  await expect(page.getByText("You must accept the terms to continue.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Ravi");
});

test("wrong password gets a generic error", async ({ page, baseURL }) => {
  const email = uniqueEmail("wrongpw");
  await registerAndConfirm(page, baseURL!, email);
  await page.context().clearCookies();
  await signIn(page, email, "Wrongpass1234");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That email and password combination didn’t work.",
  );
  await signIn(page, uniqueEmail("nobody"), "Wrongpass1234");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That email and password combination didn’t work.",
  );
});

test("protected pages redirect to sign-in and return afterwards; next= cannot redirect off-site", async ({
  page,
  baseURL,
}) => {
  const email = uniqueEmail("next");
  await registerAndConfirm(page, baseURL!, email);
  await page.context().clearCookies();

  await page.goto("/account/sessions");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fsessions/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(STRONG_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/sessions$/);
  await expect(page.getByText("This device")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, STRONG_PASSWORD, "//evil.example/steal");
  await expect(page).toHaveURL(new RegExp(`^${baseURL}/account$`));
});

test("profile edits persist; sign out ends the session", async ({ page, baseURL }) => {
  const email = uniqueEmail("profile");
  await registerAndConfirm(page, baseURL!, email);
  await page.goto("/account/profile");
  await page.getByLabel("Name").fill("Meera K");
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("State").fill("Kerala");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Profile saved.");
  await page.goto("/account");
  await expect(page.getByText("Kochi, Kerala")).toBeVisible();

  await page.getByRole("button", { name: /Meera K/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(new RegExp(`^${baseURL}/$`));
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("password reset via one-time email link; old password stops working", async ({ page, baseURL }) => {
  const email = uniqueEmail("reset");
  await registerAndConfirm(page, baseURL!, email);
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("If an account exists");

  const link = await emailLink(email, /Reset your password/);
  await page.goto(onApp(link, baseURL!));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel(/^New password/).fill("Newpass56789");
  await page.getByLabel("Confirm new password").fill("Newpass56789");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/account\?notice=password-changed/);

  await page.context().clearCookies();
  await signIn(page, email, STRONG_PASSWORD);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await signIn(page, email, "Newpass56789");
  await expect(page).toHaveURL(/\/account$/);
});

test("non-staff users get a 404 for the admin area", async ({ page, baseURL }) => {
  await registerAndConfirm(page, baseURL!, uniqueEmail("nonstaff"));
  // Under Partial Prerendering the status line is sent with the static shell, so the streamed notFound() renders the
  // 404 UI with HTTP 200 (TD-23). What matters: no admin content is ever rendered or sent.
  const res = await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page doesn’t exist.");
  const html = await res!.text();
  expect(html).not.toContain("Effective permissions");
  expect(html).not.toContain("admin.dashboard.view");
  await page.goto("/admin/mfa");
  await expect(page.getByRole("heading", { level: 1, name: "This page doesn’t exist." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up authenticator app" })).toHaveCount(0);
});

test("staff must enrol and verify an authenticator app before the admin area opens", async ({ page, baseURL }) => {
  const email = uniqueEmail("staff");
  await registerAndConfirm(page, baseURL!, email);
  sql(`select core.operator_grant_role('${email}', 'admin', 'e2e staff fixture')`);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin/);
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.locator("code").textContent())!.trim();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByText("That code didn’t work")).toBeVisible();

  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByText(/^Effective permissions/).click();
  await expect(page.getByText("users.read")).toBeVisible();
  await expect(page.getByText("roles.manage")).toHaveCount(0);

  // A new session starts at aal1 and must verify again
  await page.context().clearCookies();
  await signIn(page, email, STRONG_PASSWORD, "/admin");
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await page.getByLabel("6-digit code").fill(totp(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const audit = sql(
    `select count(*) from core.audit_logs a join core.profiles p on p.id = (a.after->>'user_id')::uuid where p.email = '${email}' and a.action = 'role.grant'`,
  );
  expect(Number(audit)).toBe(1);
});

test("account deletion can be requested and cancelled", async ({ page, baseURL }) => {
  await registerAndConfirm(page, baseURL!, uniqueEmail("delete"));
  await page.goto("/account/delete");
  await page.getByRole("button", { name: "Request account deletion" }).click();
  await expect(page.getByText("Please confirm that you understand.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request account deletion" }).click();
  await expect(page).toHaveURL(/notice=deletion-requested/);
  await expect(page.getByRole("heading", { name: "Deletion requested" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel deletion request" }).click();
  await expect(page).toHaveURL(/notice=deletion-cancelled/);
});

test("auth pages are not indexable", async ({ page }) => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("sign-up is rate limited per IP (fails closed with a clear message)", async ({ page }) => {
  // Pre-fill this IP's sign-up window to its limit (10/hour), then attempt one more sign-up through the UI.
  sql("delete from core.rate_limits where bucket like 'signup:%'");
  sql(`insert into core.rate_limits (bucket, window_start, hits)
       select bucket, to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 10
       from (select 'signup:ip:' || encode(extensions.digest(lower('ip|' || ip), 'sha256'), 'hex') as bucket
             from unnest(array['unknown', '::1', '127.0.0.1', '::ffff:127.0.0.1']) ip) b`);
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Limited");
  await page.getByLabel("Email").fill(uniqueEmail("limited"));
  await page.getByLabel(/^Password/).fill(STRONG_PASSWORD);
  await page.getByLabel("Confirm password").fill(STRONG_PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Too many attempts. Please wait a few minutes and try again.",
  );
  sql("delete from core.rate_limits where bucket like 'signup:%'");
});
