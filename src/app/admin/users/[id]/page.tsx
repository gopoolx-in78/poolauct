import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, Stat, qp } from "../../admin-kit";
import { grantRoleAction, revokeRoleAction, revokeUserSessionsAction, setUserStatusAction } from "../actions";

export const metadata = { title: "User" };

const NOTICES: Record<string, string> = {
  suspended: "Account suspended. All of the user’s sessions were ended.",
  reactivated: "Account reactivated.",
  "sessions-revoked": "All of the user’s sessions were ended.",
  "role-granted": "Role granted.",
  "role-revoked": "Role revoked.",
};

type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED" | "DELETED";
  createdAt: string;
  deletionRequestedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  roles: {
    id: string;
    role: string;
    name: string;
    isStaff: boolean;
    grantedAt: string;
    reason: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  }[];
  verifications: { level: string; status: string; createdAt: string; reviewedAt: string | null }[];
  activeSessions: number;
  mfaFactors: number;
  securityEvents: { kind: string; at: string }[];
  activity: {
    poolMemberships: number;
    poolOrders: number;
    auctionDeposits: number;
    auctionBids: number;
    auctionWins: number;
  };
};

const GRANTABLE = [
  "super_admin",
  "admin",
  "poolx_manager",
  "auction_manager",
  "finance_manager",
  "seller_manager",
  "customer_support",
  "content_manager",
  "seller",
  "bidder",
];

const field = "border-rule bg-surface rounded border px-3";

export default function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem]" />}>
      <AdminUserView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminUserView({
  params,
  searchParams,
}: Pick<PageProps<"/admin/users/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const account = await requireStaff(`/admin/users/${id}`, "users.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data }, sp] = await Promise.all([
    supabase.schema("api").rpc("admin_get_user", { p_user: id }),
    searchParams,
  ]);
  const u = data as AdminUser | null;
  if (!u) notFound();
  const can = (p: string) => account.permissions.includes(p);
  const self = u.id === account.id;
  const activeRoles = u.roles.filter((r) => !r.revokedAt);
  const isStaffUser = activeRoles.some((r) => r.isStaff);

  return (
    <div className="max-w-5xl">
      <AdminCrumbs
        trail={[{ href: "/admin", label: "Admin" }, { href: "/admin/users", label: "Users" }, { label: u.email }]}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl break-all">{u.email}</h1>
        <Badge tone={u.status === "ACTIVE" ? "success" : u.status === "SUSPENDED" ? "danger" : "warning"}>
          {u.status.replaceAll("_", " ").toLowerCase()}
        </Badge>
      </div>
      <Flash notice={NOTICES[qp(sp, "notice") ?? ""]} error={qp(sp, "error")} />

      <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Name</dt>
          <dd>{u.displayName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Phone</dt>
          <dd>{u.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Location</dt>
          <dd>{[u.city, u.state].filter(Boolean).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Joined</dt>
          <dd>{formatIST(u.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Last sign-in</dt>
          <dd>{u.lastSignInAt ? formatIST(u.lastSignInAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Email confirmed · MFA factors</dt>
          <dd>
            {u.emailConfirmed ? "yes" : "no"} · {u.mfaFactors}
          </dd>
        </div>
        {u.status === "SUSPENDED" ? (
          <div className="sm:col-span-3">
            <dt className="text-ink-muted">Suspended</dt>
            <dd>
              {u.suspendedAt ? formatIST(u.suspendedAt) : ""} — {u.suspensionReason}
            </dd>
          </div>
        ) : null}
        {u.deletionRequestedAt ? (
          <div className="sm:col-span-3">
            <dt className="text-ink-muted">Deletion requested</dt>
            <dd>{formatIST(u.deletionRequestedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="act-h" className="mt-8">
        <h2 id="act-h" className="text-2xl">
          Activity
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-5">
          <Stat label="Pool memberships" value={u.activity.poolMemberships} />
          <Stat label="Pool orders" value={u.activity.poolOrders} />
          <Stat label="Auction deposits" value={u.activity.auctionDeposits} />
          <Stat label="Bids" value={u.activity.auctionBids} />
          <Stat label="Auctions won" value={u.activity.auctionWins} />
        </dl>
      </section>

      <section aria-labelledby="roles-h" className="mt-10">
        <h2 id="roles-h" className="text-2xl">
          Roles
        </h2>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Role history for {u.email}</caption>
          <thead className="text-ink-muted text-xs uppercase">
            <tr>
              <th scope="col" className="py-1">
                Role
              </th>
              <th scope="col">Granted</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {u.roles.map((r) => (
              <tr key={r.id} className="border-rule border-t align-top">
                <td className="py-1">
                  {r.name}
                  {r.isStaff ? <span className="text-ink-muted"> (staff)</span> : null}
                </td>
                <td>
                  {formatIST(r.grantedAt, { withTime: false })}
                  {r.reason ? <span className="text-ink-muted block text-xs">{r.reason}</span> : null}
                </td>
                <td>
                  {r.revokedAt ? (
                    <>
                      revoked {formatIST(r.revokedAt, { withTime: false })}
                      {r.revokeReason ? <span className="text-ink-muted block text-xs">{r.revokeReason}</span> : null}
                    </>
                  ) : (
                    "active"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {can("roles.manage") && !self ? (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <form action={grantRoleAction} className="grid gap-2">
              <input type="hidden" name="userId" value={u.id} />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Grant role</span>
                <select name="role" className={`${field} h-11`}>
                  {GRANTABLE.filter((g) => !activeRoles.some((r) => r.role === g)).map((g) => (
                    <option key={g} value={g}>
                      {g.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Reason (recorded)</span>
                <input name="reason" required minLength={10} className={`${field} h-11`} />
              </label>
              <Button type="submit" variant="secondary" className="justify-self-start">
                Grant role
              </Button>
            </form>
            {activeRoles.some((r) => r.role !== "customer") ? (
              <form action={revokeRoleAction} className="grid gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Revoke role</span>
                  <select name="role" className={`${field} h-11`}>
                    {activeRoles
                      .filter((r) => r.role !== "customer")
                      .map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Reason (recorded)</span>
                  <input name="reason" required minLength={10} className={`${field} h-11`} />
                </label>
                <Button type="submit" variant="danger" className="justify-self-start">
                  Revoke role
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      {!self && (can("users.suspend") || can("users.sessions.revoke")) ? (
        <section aria-labelledby="acc-h" className="mt-10">
          <h2 id="acc-h" className="text-2xl">
            Account actions
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            Active sessions: {u.activeSessions}. Every action needs a reason and is audited.
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {can("users.suspend") && (!isStaffUser || can("roles.manage")) && u.status !== "DELETED" ? (
              <form action={setUserStatusAction} className="grid gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="status" value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">
                    {u.status === "SUSPENDED" ? "Reason for reactivating" : "Reason for suspending"}
                  </span>
                  <input name="reason" required minLength={10} className={`${field} h-11`} />
                </label>
                <Button
                  type="submit"
                  variant={u.status === "SUSPENDED" ? "secondary" : "danger"}
                  className="justify-self-start"
                >
                  {u.status === "SUSPENDED" ? "Reactivate account" : "Suspend account"}
                </Button>
              </form>
            ) : null}
            {can("users.sessions.revoke") && u.activeSessions > 0 ? (
              <form action={revokeUserSessionsAction} className="grid gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Reason for signing the user out everywhere</span>
                  <input name="reason" required minLength={10} className={`${field} h-11`} />
                </label>
                <Button type="submit" variant="secondary" className="justify-self-start">
                  End all sessions
                </Button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="ver-h">
          <h2 id="ver-h" className="text-2xl">
            Verifications
          </h2>
          {u.verifications.length === 0 ? (
            <p className="text-ink-muted mt-2 text-sm">None recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {u.verifications.map((v) => (
                <li key={v.level + v.createdAt}>
                  {v.level.replaceAll("_", " ")} — {v.status.toLowerCase()} (
                  {formatIST(v.createdAt, { withTime: false })})
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="sec-h">
          <h2 id="sec-h" className="text-2xl">
            Recent security events
          </h2>
          {u.securityEvents.length === 0 ? (
            <p className="text-ink-muted mt-2 text-sm">None.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {u.securityEvents.map((e) => (
                <li key={e.kind + e.at}>
                  <span className="font-mono text-xs">{e.kind}</span> · {formatIST(e.at)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
