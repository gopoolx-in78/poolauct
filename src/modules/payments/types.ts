/** Provider-agnostic payment types. Amounts are integer paise (bigint). */

export type ProviderName = "sandbox" | "razorpay";

export type CreateOrderInput = {
  attemptId: string;
  amountPaise: bigint;
  currency: "INR";
  /** Short, non-sensitive receipt reference shown in provider dashboards. */
  receipt: string;
};

export type CreatedOrder = {
  providerOrderId: string;
  /** Where to send the user to pay (a hosted checkout or, for sandbox, our test page). */
  checkoutUrl: string;
};

/** Normalised webhook event. Only verified events are ever constructed. */
export type PaymentEvent = {
  eventId: string;
  type: "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed";
  orderId: string | null;
  paymentId: string | null;
  refundId: string | null;
  amountPaise: bigint | null;
  currency: string | null;
  /** Provider payload with secrets/PII removed — stored for audit. */
  safePayload: Record<string, unknown>;
};

export type RefundInput = {
  providerPaymentId: string;
  amountPaise: bigint;
  /** Stable per refund: a retried call must never create a second refund at the provider. */
  idempotencyKey: string;
};

export type RefundOutcome =
  | { status: "PROCESSED" | "PROCESSING"; providerRefundId: string }
  | { status: "FAILED"; error: string; retryable: boolean; providerRefundId?: string };

export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  readonly name: ProviderName;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verifies authenticity (signature + freshness) and returns a normalised event, or throws WebhookVerificationError. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
  refund(input: RefundInput): Promise<RefundOutcome>;
}
