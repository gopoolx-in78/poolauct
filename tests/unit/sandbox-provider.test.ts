import { describe, expect, it } from "vitest";
import { paise } from "@/lib/money";
import { SANDBOX_TIMESTAMP_HEADER, SandboxProvider } from "@/modules/payments/server/sandbox";
import { WebhookVerificationError } from "@/modules/payments/types";

const provider = new SandboxProvider("x".repeat(64));

describe("sandbox provider webhook verification", () => {
  it("accepts a correctly signed, fresh event", async () => {
    const { body, headers } = provider.checkoutEvent("captured", "sbx_order_1", paise(123456));
    const event = await provider.verifyWebhook(body, new Headers(headers));
    expect(event.type).toBe("payment.captured");
    expect(event.orderId).toBe("sbx_order_1");
    expect(event.amountPaise).toBe(123456n);
  });

  it("rejects a tampered body", async () => {
    const { body, headers } = provider.checkoutEvent("captured", "sbx_order_1", paise(100));
    const tampered = body.replace('"100"', '"1"');
    await expect(provider.verifyWebhook(tampered, new Headers(headers))).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("rejects a signature made with another secret", async () => {
    const other = new SandboxProvider("y".repeat(64));
    const { body, headers } = other.checkoutEvent("captured", "o", paise(1));
    await expect(provider.verifyWebhook(body, new Headers(headers))).rejects.toThrow("signature mismatch");
  });

  it("rejects stale events (replay protection)", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const { body, headers } = provider.sign(
      {
        id: "e1",
        type: "payment.captured",
        order_id: "o",
        payment_id: "p",
        refund_id: null,
        amount: "1",
        currency: "INR",
      },
      old,
    );
    await expect(provider.verifyWebhook(body, new Headers(headers))).rejects.toThrow(/stale/);
  });

  it("rejects missing headers", async () => {
    const { body } = provider.checkoutEvent("failed", "o", paise(1));
    await expect(provider.verifyWebhook(body, new Headers({ [SANDBOX_TIMESTAMP_HEADER]: "1" }))).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("returns the same refund id for the same idempotency key", async () => {
    const a = await provider.refund({
      providerPaymentId: "p",
      amountPaise: paise(1),
      idempotencyKey: "poolx-refund:1",
    });
    const b = await provider.refund({
      providerPaymentId: "p",
      amountPaise: paise(1),
      idempotencyKey: "poolx-refund:1",
    });
    const c = await provider.refund({
      providerPaymentId: "p",
      amountPaise: paise(1),
      idempotencyKey: "poolx-refund:2",
    });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
