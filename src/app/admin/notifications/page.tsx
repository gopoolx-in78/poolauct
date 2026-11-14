import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { channelStatus } from "@/modules/notifications/server/channels";
import { AdminCrumbs, Flash, Pager, Stat, offsetParam, qp } from "../admin-kit";
import { retryDeliveryAction } from "./actions";

export const metadata = { title: "Notification deliveries" };

const LIMIT = 50;
const STATUSES = ["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"] as const;
type Status = (typeof STATUSES)[number];

type Overview = {
  byStatus: Partial<Record<Status, number>>;
  notifications7d: number;
  errors7d: number;
  recentErrors: { source: string; message: string; createdAt: string }[];
  events: { key: string; label: string; domain: string }[];
};
type Delivery = {
  id: string;
  channel: string;
  status: Status;
  attempts: number;
  event: string;
  userEmail: string;
  provider: string | null;
  lastError: string | null;
  sentAt: string | null;
  nextAttemptAt: string;
  createdAt: string;
};

const TONE: Record<Status, "neutral" | "success" | "warning" | "danger" | "info"> = {
  QUEUED: "info",
  SENDING: "info",
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "warning",
};

export default function NotificationDeliveriesPage({ searchParams }: PageProps<"/admin/notifications">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Deliveries searchParams={searchParams} />
    </Suspense>
  );
}

async function Deliveries({ searchParams }: Pick<PageProps<"/admin/notifications">, "searchParams">) {
  await requireStaff("/admin/notifications", "support.tickets");
  const sp = await searchParams;
  const statusParam = qp(sp, "status") ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const event = qp(sp, "event") ?? "";
  const q = qp(sp, "q") ?? "";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const [{ data: ov }, { data }] = await Promise.all([
    supabase.schema("api").rpc("admin_notification_overview"),
    supabase.schema("api").rpc("admin_list_notification_deliveries", {
      p_status: status || null,
      p_event: event || null,
      p_search: q || null,
      p_limit: LIMIT,
      p_offset: offset,
    }),
  ]);
  const overview = ov as Overview | null;
  const list = (data ?? { total: 0, items: [] }) as { total: number; items: Delivery[] };
  const channels = channelStatus();
  const labels = new Map((overview?.events ?? []).map((e) => [e.key, e.label]));
  const field = "border-rule bg-surface h-11 rounded border px-3";
  const back = `/admin/notifications?${new URLSearchParams({ status, event, q, offset: String(offset) })}`;

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Notification deliveries" }]} />
      <h1 className="mt-2 text-4xl">Notification deliveries</h1>
      <p className="text-ink-muted mt-2 max-w-3xl text-sm">
        Every in-app notification is stored for the customer; this log tracks the e-mail copies. SMS and WhatsApp stay
        off until an approved provider is configured (OD-07).
      </p>
      <Flash
        notice={qp(sp, "notice") === "queued" ? "Delivery queued again. The next job run will send it." : undefined}
        error={qp(sp, "error")}
      />

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="E-mail channel" value={channels.EMAIL.available ? "On" : "Off"} sub={channels.EMAIL.note} />
        <Stat label="Notifications (7 days)" value={overview?.notifications7d ?? 0} />
        <Stat
          label="E-mails sent / failed (7 days)"
          value={`${overview?.byStatus.SENT ?? 0} / ${overview?.byStatus.FAILED ?? 0}`}
          sub={`${overview?.byStatus.SKIPPED ?? 0} skipped · ${(overview?.byStatus.QUEUED ?? 0) + (overview?.byStatus.SENDING ?? 0)} waiting`}
        />
        <Stat label="Trigger errors (7 days)" value={overview?.errors7d ?? 0} />
      </dl>

      {overview && overview.recentErrors.length > 0 ? (
        <details className="border-danger mt-6 border-l-4 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Recent trigger errors (business actions were not affected)
          </summary>
          <ul className="mt-2 space-y-1">
            {overview.recentErrors.map((e, i) => (
              <li key={i} className="font-mono text-xs break-all">
                {formatIST(e.createdAt)} · {e.source}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <form role="search" action="/admin/notifications" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={status} className={`${field} w-40`}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Event</span>
          <select name="event" defaultValue={event} className={`${field} w-64`}>
            <option value="">Any</option>
            {(overview?.events ?? []).map((e) => (
              <option key={e.key} value={e.key}>
                {e.domain === "poolx" ? "PoolX" : "Auction"} · {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Customer e-mail contains</span>
          <input name="q" defaultValue={q} className={`${field} w-56`} />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {list.items.length === 0 ? (
        <EmptyState className="mt-8" title="No deliveries match" />
      ) : (
        <ul className="mt-6 space-y-2">
          {list.items.map((d) => (
            <li key={d.id} className="border-rule border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[d.status]}>{d.status}</Badge>
                  <span className="font-medium">{labels.get(d.event) ?? d.event}</span>
                  <span className="text-ink-muted">to {d.userEmail}</span>
                </span>
                <span className="text-ink-muted text-xs">
                  {formatIST(d.createdAt)} · {d.channel.toLowerCase()} · {d.attempts} attempt
                  {d.attempts === 1 ? "" : "s"}
                  {d.provider ? ` · ${d.provider}` : ""}
                </span>
              </div>
              {d.sentAt ? <p className="text-ink-muted mt-1 text-xs">Sent {formatIST(d.sentAt)}</p> : null}
              {d.status === "QUEUED" && d.attempts > 0 ? (
                <p className="text-ink-muted mt-1 text-xs">Next attempt {formatIST(d.nextAttemptAt)}</p>
              ) : null}
              {d.lastError ? <p className="mt-1 font-mono text-xs">{d.lastError}</p> : null}
              {d.status === "FAILED" || d.status === "SKIPPED" ? (
                <form action={retryDeliveryAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Reason (recorded)</span>
                    <input name="reason" required minLength={10} maxLength={300} className={`${field} h-9 w-72`} />
                  </label>
                  <Button type="submit" size="sm" variant="secondary">
                    Send again
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pager
        basePath="/admin/notifications"
        params={{ status, event, q }}
        total={list.total}
        limit={LIMIT}
        offset={offset}
      />
    </>
  );
}
