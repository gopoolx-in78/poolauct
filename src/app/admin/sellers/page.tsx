import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, qp } from "../admin-kit";
import { setSellerStatusAction } from "./actions";

export const metadata = { title: "Sellers" };

type Seller = {
  id: string;
  displayName: string;
  kind?: "PLATFORM" | "THIRD_PARTY";
  status: "UNVERIFIED" | "VERIFIED" | "SUSPENDED";
  verifiedAt: string | null;
  note: string | null;
  createdAt: string;
  listings: number;
  grossOrdersPaise?: string | null;
  paidSalesPaise?: string | null;
};
type SellersData = { poolx: Seller[]; auction: Seller[]; settlementsVisible: boolean };

export default function SellersPage({ searchParams }: PageProps<"/admin/sellers">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Sellers searchParams={searchParams} />
    </Suspense>
  );
}

async function Sellers({ searchParams }: Pick<PageProps<"/admin/sellers">, "searchParams">) {
  await requireStaff("/admin/sellers", "sellers.manage");
  const supabase = await createSupabaseServerClient();
  const [{ data }, sp] = await Promise.all([supabase.schema("api").rpc("admin_list_sellers"), searchParams]);
  const d = data as SellersData | null;
  if (!d) return <p role="alert">Could not load sellers.</p>;

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Sellers" }]} />
      <h1 className="mt-2 text-4xl">Sellers</h1>
      <p className="text-ink-muted mt-2 max-w-3xl text-sm">
        A seller shows as verified only after staff record what was checked. PoolX and Auction sellers are separate
        records.
        {d.settlementsVisible
          ? " Sales figures are gross amounts before any payout; payouts are not available until a settlement arrangement is approved (OD-03)."
          : ""}
      </p>
      <Flash
        notice={qp(sp, "notice") === "seller-updated" ? "Seller status updated." : undefined}
        error={qp(sp, "error")}
      />
      <SellerTable
        title="PoolX sellers"
        domain="poolx"
        sellers={d.poolx}
        money={d.settlementsVisible ? "grossOrdersPaise" : null}
      />
      <SellerTable
        title="Auction sellers"
        domain="auction"
        sellers={d.auction}
        money={d.settlementsVisible ? "paidSalesPaise" : null}
      />
    </>
  );
}

function SellerTable({
  title,
  domain,
  sellers,
  money,
}: {
  title: string;
  domain: "poolx" | "auction";
  sellers: Seller[];
  money: "grossOrdersPaise" | "paidSalesPaise" | null;
}) {
  const id = `${domain}-sellers`;
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-2xl">
        {title}
      </h2>
      {sellers.length === 0 ? (
        <EmptyState className="mt-4" title="No sellers yet" />
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Seller
                </th>
                <th scope="col">Status</th>
                <th scope="col">Listings</th>
                {money ? <th scope="col">{money === "grossOrdersPaise" ? "Gross orders" : "Paid sales"}</th> : null}
                <th scope="col">Change status</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-rule border-t align-top">
                  <td className="py-2">
                    <span className="font-medium">{s.displayName}</span>
                    {s.kind ? (
                      <span className="text-ink-muted"> · {s.kind === "PLATFORM" ? "platform" : "third party"}</span>
                    ) : null}
                    {s.note ? <span className="text-ink-muted block text-xs">{s.note}</span> : null}
                  </td>
                  <td>
                    <Badge tone={s.status === "VERIFIED" ? "success" : s.status === "SUSPENDED" ? "danger" : "neutral"}>
                      {s.status.toLowerCase()}
                    </Badge>
                    {s.verifiedAt ? (
                      <span className="text-ink-muted block text-xs">
                        {formatIST(s.verifiedAt, { withTime: false })}
                      </span>
                    ) : null}
                  </td>
                  <td className="font-mono">{s.listings}</td>
                  {money ? <td className="font-mono">{formatINR(paise(s[money] ?? "0"))}</td> : null}
                  <td>
                    <form action={setSellerStatusAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="domain" value={domain} />
                      <input type="hidden" name="sellerId" value={s.id} />
                      <label className="sr-only" htmlFor={`st-${s.id}`}>
                        New status for {s.displayName}
                      </label>
                      <select
                        id={`st-${s.id}`}
                        name="status"
                        defaultValue={s.status === "VERIFIED" ? "SUSPENDED" : "VERIFIED"}
                        className="border-rule bg-surface h-9 rounded border px-2 text-xs"
                      >
                        <option value="VERIFIED">Verified</option>
                        <option value="UNVERIFIED">Unverified</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                      <label className="sr-only" htmlFor={`nt-${s.id}`}>
                        Note for {s.displayName}
                      </label>
                      <input
                        id={`nt-${s.id}`}
                        name="note"
                        required
                        minLength={10}
                        placeholder="What was checked / why"
                        className="border-rule bg-surface h-9 w-56 rounded border px-2 text-xs"
                      />
                      <Button type="submit" size="sm" variant="secondary">
                        Save
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
