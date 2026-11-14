import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { site } from "@/config/site";
import { buildNotificationEmail } from "../email";
import type { NotificationData } from "../catalog";
import { ChannelUnavailableError, DeliveryError, getEmailChannel, type EmailChannel } from "./channels";

type Claimed = {
  delivery_id: string;
  channel: "EMAIL" | "SMS" | "WHATSAPP";
  attempt_no: number;
  event_key: string;
  data: NotificationData;
  link: string | null;
  email: string;
  display_name: string | null;
  profile_status: string;
};

type Outcome = {
  status: "SENT" | "FAILED" | "SKIPPED";
  provider: string;
  messageId?: string;
  error?: string;
  retryable?: boolean;
};

/**
 * Delivery worker (scheduled every minute): claim due deliveries → send through the channel adapter → record the
 * outcome. A delivery is SENT only when the provider accepted it and returned a message id.
 */
export async function processNotificationDeliveries(limit = 50) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.schema("api").rpc("notifications_claim_deliveries", { p_limit: limit });
  if (error) throw new Error(`notifications_claim_deliveries failed: ${error.code}`);

  let email: EmailChannel | null = null;
  let emailUnavailable: string | null = null;
  try {
    email = getEmailChannel();
  } catch (e) {
    emailUnavailable = e instanceof ChannelUnavailableError ? e.code : "EMAIL_NOT_CONFIGURED";
  }

  const counts = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  for (const row of (data ?? []) as Claimed[]) {
    const outcome = await deliver(row, email, emailUnavailable);
    const { data: recorded, error: recordError } = await admin.schema("api").rpc("notifications_record_delivery", {
      p_delivery: row.delivery_id,
      p_status: outcome.status,
      p_provider: outcome.provider,
      p_message_id: outcome.messageId ?? null,
      p_error: outcome.error ?? null,
      p_retryable: outcome.retryable ?? null,
    });
    if (recordError) throw new Error(`notifications_record_delivery failed: ${recordError.code}`);
    if (recorded === "SENT") counts.sent++;
    else if (recorded === "RETRY") counts.retry++;
    else if (recorded === "SKIPPED") counts.skipped++;
    else if (recorded === "FAILED") counts.failed++;
  }
  return counts;
}

async function deliver(row: Claimed, email: EmailChannel | null, emailUnavailable: string | null): Promise<Outcome> {
  if (row.channel !== "EMAIL") return { status: "SKIPPED", provider: "none", error: "CHANNEL_NOT_AVAILABLE" };
  if (row.profile_status === "DELETED") return { status: "SKIPPED", provider: "none", error: "ACCOUNT_DELETED" };
  if (!email) return { status: "SKIPPED", provider: "none", error: emailUnavailable ?? "EMAIL_NOT_CONFIGURED" };
  const message = buildNotificationEmail({
    event: row.event_key,
    data: row.data,
    link: row.link,
    siteUrl: site.url,
    brand: site.name,
    recipientName: row.display_name,
  });
  try {
    const { messageId } = await email.send({ email: row.email, name: row.display_name }, message);
    return { status: "SENT", provider: email.provider, messageId };
  } catch (e) {
    const retryable = e instanceof DeliveryError ? e.retryable : true;
    // never log or store message content or the address; the error text is ours
    return {
      status: "FAILED",
      provider: email.provider,
      error: e instanceof DeliveryError ? e.message : "send failed",
      retryable,
    };
  }
}
