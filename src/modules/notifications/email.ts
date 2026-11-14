import { renderNotification, type NotificationData } from "./catalog";

export type EmailMessage = { subject: string; text: string; html: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Header injection guard: subjects are a single line. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

/**
 * Builds a transactional e-mail from a stored notification. `link` must be an internal path (the database enforces
 * it); it is joined to the configured site URL. Nothing from the browser is used here.
 */
export function buildNotificationEmail(input: {
  event: string;
  data: NotificationData;
  link: string | null;
  siteUrl: string;
  brand: string;
  recipientName?: string | null;
}): EmailMessage {
  const { title, body } = renderNotification(input.event, input.data);
  const base = input.siteUrl.replace(/\/+$/, "");
  const url =
    input.link && /^\/[a-z0-9][a-z0-9/_-]*$/.test(input.link)
      ? `${base}${input.link}`
      : `${base}/account/notifications`;
  const prefs = `${base}/account/notifications/preferences`;
  const greeting = input.recipientName?.trim() ? `Hello ${oneLine(input.recipientName)},` : "Hello,";
  const subject = oneLine(`${title} — ${input.brand}`).slice(0, 200);

  const text = [
    greeting,
    "",
    body,
    "",
    `View details: ${url}`,
    "",
    "—",
    input.brand,
    `Notification settings: ${prefs}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f1d1a;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
<h1 style="font-size:20px;margin:16px 0">${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(url)}">View details</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
<p style="font-size:12px;color:#5c574f">${escapeHtml(input.brand)} · <a href="${escapeHtml(prefs)}">Notification settings</a></p>
</body></html>`;
  return { subject, text, html };
}
