import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  WebhookVerificationError,
  type CreateOrderInput,
  type CreatedOrder,
  type PaymentEvent,
  type PaymentProvider,
  type RefundInput,
  type RefundOutcome,
} from "../types";

/**
 * TEST-ONLY payment provider (TD-06). No money moves. It exists so the complete flow — order, checkout, signed
 * webhook, idempotent processing, refunds — can be built and tested before real provider credentials exist.
 * The registry refuses to construct it when APP_ENV=production, and its checkout page is labelled as a test.
 */
export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";
export const SANDBOX_TIMESTAMP_HEADER = "x-sandbox-timestamp";
const MAX_SKEW_SECONDS = 300;

type SandboxWireEvent = {
  id: string;
  type: PaymentEvent["type"];
  order_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  amount: string | null;
  currency: string | null;
  failure_code?: string;
};

export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox" as const;
  constructor(private readonly secret: string) {}

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return { providerOrderId: `sbx_order_${randomUUID()}`, checkoutUrl: `/payments/sandbox/${input.attemptId}` };
  }

  /** Signs a test event exactly as a real provider would sign a webhook body. */
  sign(event: SandboxWireEvent, nowSeconds = Math.floor(Date.now() / 1000)) {
    const body = JSON.stringify(event);
    const timestamp = String(nowSeconds);
    const signature = createHmac("sha256", this.secret).update(`${timestamp}.${body}`).digest("hex");
    return { body, headers: { [SANDBOX_SIGNATURE_HEADER]: signature, [SANDBOX_TIMESTAMP_HEADER]: timestamp } };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const signature = headers.get(SANDBOX_SIGNATURE_HEADER) ?? "";
    const timestamp = headers.get(SANDBOX_TIMESTAMP_HEADER) ?? "";
    if (!/^[0-9a-f]{64}$/.test(signature) || !/^\d{1,12}$/.test(timestamp)) {
      throw new WebhookVerificationError("missing or malformed signature");
    }
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > MAX_SKEW_SECONDS) throw new WebhookVerificationError("stale webhook (replay protection)");

    const expected = createHmac("sha256", this.secret).update(`${timestamp}.${rawBody}`).digest();
    const given = Buffer.from(signature, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new WebhookVerificationError("signature mismatch");
    }

    let e: SandboxWireEvent;
    try {
      e = JSON.parse(rawBody) as SandboxWireEvent;
    } catch {
      throw new WebhookVerificationError("invalid JSON");
    }
    const types: PaymentEvent["type"][] = ["payment.captured", "payment.failed", "refund.processed", "refund.failed"];
    if (typeof e.id !== "string" || !types.includes(e.type)) throw new WebhookVerificationError("unsupported event");
    if (e.amount !== null && !/^\d{1,15}$/.test(String(e.amount))) throw new WebhookVerificationError("invalid amount");

    return {
      eventId: e.id,
      type: e.type,
      orderId: e.order_id ?? null,
      paymentId: e.payment_id ?? null,
      refundId: e.refund_id ?? null,
      amountPaise: e.amount === null ? null : BigInt(e.amount),
      currency: e.currency ?? null,
      safePayload: { type: e.type, failure_code: e.failure_code ?? null },
    };
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    // Deterministic id per idempotency key: retrying never creates a second refund.
    const id = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24);
    return { status: "PROCESSED", providerRefundId: `sbx_rfnd_${id}` };
  }

  /** Builds a signed capture/failure event for the test checkout page. */
  checkoutEvent(kind: "captured" | "failed", orderId: string, amountPaise: bigint) {
    return this.sign({
      id: `sbx_evt_${randomUUID()}`,
      type: kind === "captured" ? "payment.captured" : "payment.failed",
      order_id: orderId,
      payment_id: kind === "captured" ? `sbx_pay_${randomUUID()}` : null,
      refund_id: null,
      amount: amountPaise.toString(),
      currency: "INR",
      ...(kind === "failed" ? { failure_code: "TEST_DECLINED" } : {}),
    });
  }
}
