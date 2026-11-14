import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Pager, offsetParam, qp } from "../admin-kit";

export const metadata = { title: "Audit log" };

const LIMIT = 50;
type Entry = {
  id: number;
  createdAt: string;
  action: string;
  actorKind: "user" | "system";
  actorEmail: string | null;
  entitySchema: string | null;
  entityTable: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
};

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  await requireStaff("/admin/audit", "audit.read");
  const sp = await searchParams;
  const action = qp(sp, "action") ?? "";
  const actor = qp(sp, "actor") ?? "";
  const entity = qp(sp, "entity") ?? "";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("admin_list_audit", {
    p_action: action || null,
    p_actor: actor || null,
    p_entity: entity || null,
    p_limit: LIMIT,
    p_offset: offset,
  });
  const list = (data ?? { total: 0, items: [] }) as { total: number; items: Entry[] };
  const field = "border-rule bg-surface h-11 rounded border px-3";

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Audit log" }]} />
      <h1 className="mt-2 text-4xl">Audit log</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Append-only: entries cannot be edited or deleted by anyone, including Super Admins.
      </p>
      <form role="search" action="/admin/audit" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Action starts with</span>
          <input
            name="action"
            defaultValue={action}
            placeholder="e.g. user. or auction.refund"
            className={`${field} w-56`}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Actor email</span>
          <input name="actor" defaultValue={actor} className={`${field} w-56`} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Record ID</span>
          <input name="entity" defaultValue={entity} className={`${field} w-72`} />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState className="mt-8" title="No audit entries match" />
      ) : (
        <ol className="mt-6 space-y-2">
          {list.items.map((e) => (
            <li key={e.id} className="border-rule border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono">{e.action}</span>
                <span className="text-ink-muted text-xs">
                  {formatIST(e.createdAt)} · {e.actorEmail ?? (e.actorKind === "system" ? "system" : "unknown")}
                </span>
              </div>
              {e.entityTable ? (
                <p className="text-ink-muted mt-1 font-mono text-xs break-all">
                  {e.entitySchema}.{e.entityTable} {e.entityId}
                </p>
              ) : null}
              {e.reason ? <p className="mt-1">Reason: {e.reason}</p> : null}
              {e.before || e.after ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs">Details</summary>
                  <pre className="bg-ink/5 relative mt-1 overflow-x-auto p-2 text-xs">
                    {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <Pager
        basePath="/admin/audit"
        params={{ action, actor, entity }}
        total={list.total}
        limit={LIMIT}
        offset={offset}
      />
    </>
  );
}
