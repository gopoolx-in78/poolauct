import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { EmailMessage } from "../email";

export type Channel = "EMAIL" | "SMS" | "WHATSAPP";

export class ChannelUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** A provider rejected or could not take the message. `retryable` decides whether the worker tries again. */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface EmailChannel {
  readonly provider: string;
  send(to: { email: string; name?: string | null }, message: EmailMessage): Promise<{ messageId: string }>;
}

/**
 * Local test inbox (Mailpit, part of the Supabase dev stack). Dev/test only — the env schema refuses it when
 * APP_ENV=production, and this check repeats it. Messages are captured locally and never reach a real inbox.
 */
class MailpitChannel implements EmailChannel {
  readonly provider = "mailpit";
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}

  async send(to: { email: string; name?: string | null }, message: EmailMessage) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: { Email: this.from },
          To: [{ Email: to.email, Name: to.name ?? "" }],
          Subject: message.subject,
          Text: message.text,
          HTML: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new DeliveryError("mail server unreachable", true);
    }
    if (!res.ok) throw new DeliveryError(`mail server returned ${res.status}`, res.status >= 500 || res.status === 429);
    const body = (await res.json().catch(() => null)) as { ID?: unknown } | null;
    if (typeof body?.ID !== "string") throw new DeliveryError("mail server returned no message id", true);
    return { messageId: body.ID };
  }
}

/** The configured e-mail channel. A real provider adapter waits for owner decision OD-07 — never faked. */
export function getEmailChannel(): EmailChannel {
  const env = getServerEnv();
  switch (env.EMAIL_PROVIDER) {
    case "mailpit":
      if (env.APP_ENV === "production") throw new ChannelUnavailableError("EMAIL_TEST_INBOX_IN_PRODUCTION");
      if (!env.MAILPIT_URL || !env.EMAIL_FROM) throw new ChannelUnavailableError("EMAIL_NOT_CONFIGURED");
      return new MailpitChannel(env.MAILPIT_URL, env.EMAIL_FROM);
    default:
      throw new ChannelUnavailableError("EMAIL_NOT_CONFIGURED");
  }
}

/** SMS and WhatsApp stay disabled until an approved provider and phone verification exist (OD-07). */
export function channelStatus(): Record<Channel, { available: boolean; note: string }> {
  let email = { available: false, note: "Not configured yet" };
  try {
    getEmailChannel();
    email = { available: true, note: "Configured" };
  } catch {
    /* unavailable */
  }
  return {
    EMAIL: email,
    SMS: { available: false, note: "Needs an approved SMS provider (OD-07)" },
    WHATSAPP: { available: false, note: "Needs an approved WhatsApp provider (OD-07)" },
  };
}
