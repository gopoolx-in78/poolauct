import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/env";
import { NOTIFICATION_EVENTS, renderNotification } from "@/modules/notifications/catalog";
import { buildNotificationEmail } from "@/modules/notifications/email";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261114000014_notifications.sql"), "utf8");
const dbEvents = [...migration.matchAll(/^\s+\('((?:poolx|auction)\.[a-z_]+)',/gm)].map((m) => m[1]);

describe("notification catalogue", () => {
  it("has wording for exactly the events seeded in the database", () => {
    expect(dbEvents).toHaveLength(28);
    expect([...NOTIFICATION_EVENTS].sort()).toEqual([...dbEvents].sort());
  });

  it("renders every event with and without data", () => {
    const sample = {
      poolTitle: "Phone pool",
      auctionTitle: "2020 Swift",
      amountPaise: "123456",
      currentBidPaise: "5050000",
      finalPricePaise: "5050000",
      amountDuePaise: "100",
      discountBps: 1250,
      members: 3,
      quantity: 2,
      startsAt: "2026-11-15T12:30:00Z",
      endsAt: "2026-11-15T15:30:00Z",
      dueAt: "2026-11-17T12:30:00Z",
      reason: "LOST",
      outcome: "RESERVE_NOT_MET",
      reference: "••••1234",
      carrier: "BlueDart",
      trackingNumber: "BD1",
      requestTitle: "Chairs",
    };
    for (const event of NOTIFICATION_EVENTS) {
      for (const data of [sample, {}]) {
        const r = renderNotification(event, data);
        expect(r.title.length, event).toBeGreaterThan(3);
        expect(r.body.length, event).toBeGreaterThan(10);
        expect(r.title + r.body, event).not.toMatch(/undefined|null|NaN|\[object/);
      }
    }
  });

  it("formats money from paise strings without floats", () => {
    expect(
      renderNotification("auction.deposit_confirmed", { amountPaise: "1000000", auctionTitle: "Car" }).body,
    ).toContain("₹10,000");
    expect(renderNotification("poolx.contribution_confirmed", { amountPaise: "12.5" }).body).toContain("the amount");
    expect(renderNotification("poolx.discount_milestone", { discountBps: 1250 }).title).toContain("12.5%");
  });

  it("falls back safely for unknown events", () => {
    expect(renderNotification("poolx.unknown", {})).toEqual({ title: "Notification", body: "" });
  });
});

describe("notification e-mail", () => {
  const base = { siteUrl: "https://example.test/", brand: "Brand" };

  it("escapes stored text in HTML and keeps the subject on one line", () => {
    const m = buildNotificationEmail({
      ...base,
      event: "auction.outbid",
      data: { auctionTitle: '<script>alert(1)</script>"x"\r\nBcc: evil@example.test', currentBidPaise: "100" },
      link: "/auctions/car",
      recipientName: "<b>Ana</b>",
    });
    expect(m.html).not.toMatch(/<script|<b>/);
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain("https://example.test/auctions/car");
  });

  it("only links to internal paths on the site", () => {
    for (const link of ["https://evil.example/x", "//evil.example", "javascript:alert(1)", null]) {
      const m = buildNotificationEmail({ ...base, event: "poolx.pool_joined", data: {}, link });
      expect(m.html, String(link)).toContain('href="https://example.test/account/notifications"');
      expect(m.html, String(link)).not.toMatch(/evil|javascript:/);
    }
  });

  it("includes a link to notification settings", () => {
    const m = buildNotificationEmail({ ...base, event: "poolx.pool_joined", data: {}, link: "/poolx/pools/a" });
    expect(m.text).toContain("https://example.test/account/notifications/preferences");
  });
});

describe("e-mail configuration", () => {
  const env = { SANDBOX_WEBHOOK_SECRET: "x".repeat(32) };

  it("refuses the test inbox in production", () => {
    const r = serverSchema.safeParse({
      ...env,
      APP_ENV: "production",
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "k",
      RAZORPAY_KEY_SECRET: "s",
      RAZORPAY_WEBHOOK_SECRET: "w",
      EMAIL_PROVIDER: "mailpit",
      EMAIL_FROM: "a@example.test",
      MAILPIT_URL: "http://127.0.0.1:1",
    });
    expect(r.success).toBe(false);
  });

  it("requires a sender and URL for the test inbox, and defaults to no e-mail", () => {
    expect(serverSchema.safeParse({ ...env, EMAIL_PROVIDER: "mailpit" }).success).toBe(false);
    const ok = serverSchema.safeParse(env);
    expect(ok.success && ok.data.EMAIL_PROVIDER).toBe("none");
  });
});
