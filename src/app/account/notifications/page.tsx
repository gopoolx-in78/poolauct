import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { renderNotification } from "@/modules/notifications/catalog";
import { markAllReadAction, markReadAction } from "./actions";
import type { Inbox } from "./types";

export const metadata = { title: "Notifications" };

const PAGE_SIZE = 20;

export default function NotificationsPage({ searchParams }: PageProps<"/account/notifications">) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Notifications</h1>
        <Link href="/account/notifications/preferences" className="text-sm underline underline-offset-4">
          Notification settings
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <InboxList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InboxList({ searchParams }: { searchParams: PageProps<"/account/notifications">["searchParams"] }) {
  await requireAccount("/account/notifications");
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const pageNo = Math.min(Math.max(Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1, 1), 999);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("notifications_list", {
    p_unread_only: unreadOnly,
    p_limit: PAGE_SIZE,
    p_offset: (pageNo - 1) * PAGE_SIZE,
  });
  if (error || !data) {
    return (
      <p role="alert" className="border-danger bg-danger/5 mt-8 border-l-4 px-4 py-3 text-sm">
        We couldn&rsquo;t load your notifications. Please refresh.
      </p>
    );
  }
  const inbox = data as Inbox;
  const pages = Math.max(Math.ceil(inbox.total / PAGE_SIZE), 1);
  const hidden = (
    <>
      {unreadOnly ? <input type="hidden" name="filter" value="unread" /> : null}
      <input type="hidden" name="page" value={pageNo} />
    </>
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter notifications" className="flex gap-1 text-sm">
          <Link
            href="/account/notifications"
            aria-current={!unreadOnly ? "page" : undefined}
            className={!unreadOnly ? "bg-ink/5 rounded px-3 py-1.5 font-medium" : "text-ink-muted rounded px-3 py-1.5"}
          >
            All
          </Link>
          <Link
            href="/account/notifications?filter=unread"
            aria-current={unreadOnly ? "page" : undefined}
            className={unreadOnly ? "bg-ink/5 rounded px-3 py-1.5 font-medium" : "text-ink-muted rounded px-3 py-1.5"}
          >
            Unread ({inbox.unread})
          </Link>
        </nav>
        {inbox.unread > 0 ? (
          <form action={markAllReadAction}>
            {hidden}
            <Button type="submit" variant="secondary" size="sm">
              Mark all as read
            </Button>
          </form>
        ) : null}
      </div>

      {inbox.items.length === 0 ? (
        <EmptyState className="mt-8" title={unreadOnly ? "You’re all caught up" : "No notifications yet"}>
          Updates about your pools, deposits, bids and refunds appear here.
        </EmptyState>
      ) : (
        <ul className="divide-rule border-rule mt-6 divide-y border-y">
          {inbox.items.map((n) => {
            const { title, body } = renderNotification(n.event, n.data);
            const unread = !n.readAt;
            return (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={n.domain === "poolx" ? "accent" : "info"}>
                      {n.domain === "poolx" ? "PoolX" : "Auction"}
                    </Badge>
                    {unread ? <span className="sr-only">Unread:</span> : null}
                    <span className={unread ? "font-semibold" : ""}>{title}</span>
                  </p>
                  <p className="text-ink-muted mt-1 text-sm">{body}</p>
                  <p className="text-ink-muted mt-1 text-xs">
                    <time dateTime={n.createdAt}>{formatIST(n.createdAt)}</time>
                    {n.link ? (
                      <>
                        {" · "}
                        <Link href={n.link} className="underline underline-offset-4">
                          View details
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {unread ? (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    {hidden}
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Mark “${title}” as read`}>
                      Mark as read
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
          {pageNo > 1 ? (
            <Link
              href={`/account/notifications?${new URLSearchParams({ ...(unreadOnly ? { filter: "unread" } : {}), page: String(pageNo - 1) })}`}
              className="underline underline-offset-4"
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">
            Page {pageNo} of {pages}
          </span>
          {pageNo < pages ? (
            <Link
              href={`/account/notifications?${new URLSearchParams({ ...(unreadOnly ? { filter: "unread" } : {}), page: String(pageNo + 1) })}`}
              className="underline underline-offset-4"
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
