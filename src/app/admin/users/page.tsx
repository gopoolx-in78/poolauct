import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Pager, offsetParam, qp } from "../admin-kit";

export const metadata = { title: "Users" };

const LIMIT = 25;
const STATUSES = ["ACTIVE", "SUSPENDED", "DELETION_REQUESTED", "DELETED"] as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  status: (typeof STATUSES)[number];
  createdAt: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  roles: string[];
};

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await requireStaff("/admin/users", "users.read");
  const sp = await searchParams;
  const q = qp(sp, "q") ?? "";
  const status = STATUSES.find((s) => s === qp(sp, "status")) ?? "";
  const role = qp(sp, "role") ?? "";
  const offset = offsetParam(sp);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("admin_list_users", {
    p_search: q || null,
    p_status: status || null,
    p_role: role || null,
    p_limit: LIMIT,
    p_offset: offset,
  });
  const list = (data ?? { total: 0, items: [] }) as { total: number; items: UserRow[] };

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Users" }]} />
      <h1 className="mt-2 text-4xl">Users</h1>
      <form role="search" className="mt-6 flex flex-wrap items-end gap-3" action="/admin/users">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Email, name or ID</span>
          <input name="q" defaultValue={q} className="border-rule bg-surface h-11 w-72 rounded border px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={status} className="border-rule bg-surface h-11 rounded border px-3">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Role</span>
          <input
            name="role"
            defaultValue={role}
            placeholder="e.g. finance_manager"
            className="border-rule bg-surface h-11 w-48 rounded border px-3"
          />
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {list.items.length === 0 ? (
        <EmptyState className="mt-8" title="No matching users" />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  User
                </th>
                <th scope="col">Status</th>
                <th scope="col">Roles</th>
                <th scope="col">Joined</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((u) => (
                <tr key={u.id} className="border-rule border-t align-top">
                  <td className="py-2">
                    <Link href={`/admin/users/${u.id}`} className="font-medium underline-offset-4 hover:underline">
                      {u.email}
                    </Link>
                    <div className="text-ink-muted text-xs">
                      {u.displayName ?? "—"}
                      {u.emailConfirmed ? "" : " · email not confirmed"}
                    </div>
                  </td>
                  <td>
                    <Badge tone={u.status === "ACTIVE" ? "success" : u.status === "SUSPENDED" ? "danger" : "warning"}>
                      {u.status.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </td>
                  <td className="font-mono text-xs">{u.roles.join(", ")}</td>
                  <td>{formatIST(u.createdAt, { withTime: false })}</td>
                  <td>{u.lastSignInAt ? formatIST(u.lastSignInAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/admin/users" params={{ q, status, role }} total={list.total} limit={LIMIT} offset={offset} />
    </>
  );
}
