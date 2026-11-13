const IST = "Asia/Kolkata";

/** e.g. "15 Nov 2026, 6:00 pm IST". Stored times are UTC; display is always Asia/Kolkata. */
export function formatIST(iso: string | Date, opts: { withTime?: boolean } = { withTime: true }) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
  if (!opts.withTime) return date;
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST });
  return `${date}, ${time} IST`;
}

/** Coarse remaining time, e.g. "2 days left", "5 hours left", "Ended". `now` must come from request time. */
export function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Ended";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.floor(hours / 24);
  return `${days} days left`;
}

/**
 * Current time for request-time Server Components (rendered once per request after `connection()`), used for
 * display only — e.g. "2 days left". Never used for business decisions: those use database time.
 */
export async function requestNow(): Promise<number> {
  const { connection } = await import("next/server");
  await connection();
  return Date.now();
}
