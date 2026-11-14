"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Bell link to the inbox with an unread badge (8.11). The server renders the first count; the root layout is kept across
 * client navigations, so the count is re-read on each navigation and when the tab becomes visible again.
 */
export function NotificationsLink({ initial }: { initial: number }) {
  const [unread, setUnread] = useState(initial);
  const [serverCount, setServerCount] = useState(initial);
  const pathname = usePathname();
  // A server re-render (e.g. after "Mark all as read") brings a fresh count: adopt it.
  if (initial !== serverCount) {
    setServerCount(initial);
    setUnread(initial);
  }

  useEffect(() => {
    let stale = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!res.ok) return;
        const body: unknown = await res.json();
        const n = (body as { unread?: unknown }).unread;
        if (!stale && typeof n === "number" && Number.isInteger(n) && n >= 0) setUnread(n);
      } catch {
        // keep the last known count
      }
    };
    void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      stale = true;
      document.removeEventListener("visibilitychange", load);
    };
  }, [pathname]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      href="/account/notifications"
      aria-label={label}
      title={label}
      className="hover:bg-ink/5 relative inline-flex size-11 items-center justify-center rounded"
    >
      <Bell aria-hidden="true" className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          data-testid="unread-badge"
          className="bg-ink text-paper absolute top-1 right-0.5 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-semibold tabular-nums"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
