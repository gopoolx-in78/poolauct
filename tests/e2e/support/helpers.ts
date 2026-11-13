import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Local Mailpit (Supabase local_smtp), see supabase/config.toml [local_smtp] port. */
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:56324";
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_poolx";

export const STRONG_PASSWORD = "Testpass1234";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`;
}

/** Runs SQL against the LOCAL Supabase database container. Test-only; never used by the app. */
export function sql(statement: string) {
  return execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", statement],
    {
      encoding: "utf8",
    },
  ).trim();
}

type MailSummary = { ID: string; Subject: string };

/** Waits for the newest email to `to` whose subject matches, and returns the link containing token_hash. */
export async function emailLink(to: string, subject: RegExp): Promise<URL> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const body = (await res.json()) as { messages: MailSummary[] };
        const msg = body.messages.find((m) => subject.test(m.Subject));
        if (!msg) return false;
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML: string };
        link = full.HTML.match(/href="([^"]*token_hash=[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
        return Boolean(link);
      },
      { timeout: 20_000, message: `email "${subject}" to ${to}` },
    )
    .toBe(true);
  return new URL(link!);
}

/** Rewrites an email link onto the app under test (emails use the configured site URL). */
export function onApp(link: URL, baseURL: string) {
  return new URL(link.pathname + link.search, baseURL).toString();
}

export async function register(page: Page, email: string, name = "E2E User") {
  await page.goto("/register");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(STRONG_PASSWORD);
  await page.getByLabel("Confirm password").fill(STRONG_PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
}

/** Registers and confirms an account; leaves the browser signed in on /account. */
export async function registerAndConfirm(page: Page, baseURL: string, email: string, name?: string) {
  await register(page, email, name);
  const link = await emailLink(email, /Confirm your email/);
  await page.goto(onApp(link, baseURL));
  await expect(page).toHaveURL(/\/account\?notice=email-confirmed/);
}

export async function signIn(page: Page, email: string, password = STRONG_PASSWORD, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// ---------------------------------------------------------------------------
// RFC 6238 TOTP (SHA-1, 30 s, 6 digits) for driving MFA in tests
// ---------------------------------------------------------------------------
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}
