import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, qp } from "../admin-kit";
import { setRolePermissionAction } from "./actions";

export const metadata = { title: "Roles & permissions" };

type RolesData = {
  roles: { key: string; name: string; isStaff: boolean; description: string; members: number; permissions: string[] }[];
  permissions: { key: string; description: string; sensitive: boolean }[];
  staff: { id: string; email: string; displayName: string | null; status: string; role: string; grantedAt: string }[];
};

const NOTICES: Record<string, string> = {
  "permission-granted": "Permission added to the role. It applies immediately.",
  "permission-revoked": "Permission removed from the role. It applies immediately.",
};

export default function RolesPage({ searchParams }: PageProps<"/admin/roles">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Roles searchParams={searchParams} />
    </Suspense>
  );
}

async function Roles({ searchParams }: Pick<PageProps<"/admin/roles">, "searchParams">) {
  await requireStaff("/admin/roles", "roles.manage");
  const supabase = await createSupabaseServerClient();
  const [{ data }, sp] = await Promise.all([supabase.schema("api").rpc("admin_list_roles"), searchParams]);
  const d = data as RolesData | null;
  if (!d) return <p role="alert">Could not load roles.</p>;
  const staffRoles = d.roles.filter((r) => r.isStaff);

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Roles & permissions" }]} />
      <h1 className="mt-2 text-4xl">Roles & permissions</h1>
      <p className="text-ink-muted mt-2 max-w-3xl text-sm">
        Staff permissions only work with an MFA session. Grant or revoke a person&rsquo;s roles from their page under{" "}
        <Link href="/admin/users" className="underline underline-offset-4">
          Users
        </Link>
        . No role can disable auction deposits, edit ledger entries or mark refunds as paid without provider
        confirmation.
      </p>
      <Flash notice={NOTICES[qp(sp, "notice") ?? ""]} error={qp(sp, "error")} />

      <section aria-labelledby="staff-h" className="mt-8">
        <h2 id="staff-h" className="text-2xl">
          Staff
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          {d.staff.map((s) => (
            <li key={s.id + s.role}>
              <Link href={`/admin/users/${s.id}`} className="underline underline-offset-4">
                {s.email}
              </Link>{" "}
              — {s.role.replaceAll("_", " ")} since {formatIST(s.grantedAt, { withTime: false })}
              {s.status !== "ACTIVE" ? <span className="text-danger"> ({s.status.toLowerCase()})</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="matrix-h" className="mt-10">
        <h2 id="matrix-h" className="text-2xl">
          Permission matrix
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-xs">
            <caption className="sr-only">Permissions granted to each staff role</caption>
            <thead>
              <tr>
                <th scope="col" className="py-2">
                  Permission
                </th>
                {staffRoles.map((r) => (
                  <th key={r.key} scope="col" className="px-1 text-center font-medium">
                    {r.name}
                    <span className="text-ink-muted block font-normal">{r.members} people</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.permissions.map((p) => (
                <tr key={p.key} className="border-rule border-t">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    <span className="font-mono">{p.key}</span>
                    {p.sensitive ? <span className="text-warning"> · sensitive</span> : null}
                    <span className="text-ink-muted block">{p.description}</span>
                  </th>
                  {staffRoles.map((r) => (
                    <td key={r.key} className="text-center">
                      {r.permissions.includes(p.key) ? (
                        <span aria-label="granted">●</span>
                      ) : (
                        <span aria-label="not granted" className="text-ink-muted">
                          ○
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="change-h" className="mt-10 max-w-3xl">
        <h2 id="change-h" className="text-2xl">
          Change a role&rsquo;s permissions
        </h2>
        <form action={setRolePermissionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Role</span>
            <select name="role" className="border-rule bg-surface h-11 rounded border px-3">
              {staffRoles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Permission</span>
            <select name="permission" className="border-rule bg-surface h-11 rounded border px-3">
              {d.permissions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.key}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Change</span>
            <select name="change" className="border-rule bg-surface h-11 rounded border px-3">
              <option value="grant">Grant</option>
              <option value="revoke">Revoke</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Reason (recorded)</span>
            <input name="reason" required minLength={10} className="border-rule bg-surface h-11 rounded border px-3" />
          </label>
          <Button type="submit" variant="secondary" className="justify-self-start">
            Apply change
          </Button>
        </form>
      </section>
    </>
  );
}
