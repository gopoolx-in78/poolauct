import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PoolDetail } from "@/modules/poolx/types";
import { closeJoiningAction, lockPoolAction, markDeliveredAction, shipOrderAction } from "../actions";
import { NegotiationForm } from "./forms";

type Lifecycle = {
  negotiations: {
    id: string;
    offeredUnitPricePaise: string | null;
    terms: string;
    outcome: string;
    createdAt: string;
    recordedBy: string;
  }[];
  orders: {
    id: string;
    member: string;
    quantity: number;
    unitPricePaise: string;
    amountPaise: string;
    status: string;
    shipment: { carrier: string; trackingNumber: string } | null;
  }[];
  refunds: { reason: string; status: string; amountPaise: string }[];
};

const input = "border-rule bg-surface h-9 rounded border px-2 text-sm";

/** Staff controls for everything after joining: close → negotiate → lock → ship → deliver. */
export async function LifecycleSection({
  pool,
  canShip,
}: {
  pool: PoolDetail & { finalUnitPricePaise?: string | null };
  canShip: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("poolx_admin_lifecycle", { p_pool: pool.id });
  const life = (data ?? { negotiations: [], orders: [], refunds: [] }) as Lifecycle;
  const adjustments = life.refunds.filter((r) => r.reason === "PRICE_ADJUSTMENT");

  return (
    <section aria-labelledby="lifecycle-h" className="border-ink border-t pt-6">
      <h2 id="lifecycle-h" className="text-2xl">
        Fulfilment
      </h2>

      {pool.status === "ACTIVE" ? (
        <form action={closeJoiningAction} className="mt-4">
          <input type="hidden" name="poolId" value={pool.id} />
          <p className="text-ink-muted mb-3 text-sm">
            Joining closes automatically at the deadline. You can close it early once at least {pool.minMembers} member
            {pool.minMembers === 1 ? " has" : "s have"} confirmed (currently {pool.activeMembers}).
          </p>
          <Button type="submit" variant="secondary" size="sm">
            Close joining now
          </Button>
        </form>
      ) : null}

      {pool.status === "THRESHOLD_MET" || pool.status === "NEGOTIATING" || life.negotiations.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xl">Seller negotiation</h3>
          {life.negotiations.length === 0 ? (
            <p className="text-ink-muted mt-2 text-sm">No offers recorded yet.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {life.negotiations.map((n) => (
                <li key={n.id} className="border-rule border-l-2 pl-3">
                  <Badge tone={n.outcome === "ACCEPTED" ? "success" : n.outcome === "REJECTED" ? "danger" : "neutral"}>
                    {n.outcome}
                  </Badge>{" "}
                  {n.offeredUnitPricePaise ? (
                    <span className="font-mono">{formatINR(paise(n.offeredUnitPricePaise))}/unit</span>
                  ) : null}{" "}
                  — {n.terms}
                  <span className="text-ink-muted block text-xs">
                    {n.recordedBy} · {formatIST(n.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {pool.status === "THRESHOLD_MET" || pool.status === "NEGOTIATING" ? (
            <>
              <div className="mt-4 max-w-lg">
                <NegotiationForm poolId={pool.id} />
              </div>
              <form action={lockPoolAction} className="border-warning bg-warning/5 mt-6 max-w-lg border-l-4 p-4">
                <input type="hidden" name="poolId" value={pool.id} />
                <p className="text-sm">
                  <strong>Lock the deal.</strong> The final price is the tier price for {pool.activeMembers} confirmed
                  members ({formatINR(paise(pool.currentUnitPricePaise))}) or the accepted seller offer if lower.
                  Members who paid more are refunded the difference, and one order is created per member. This
                  can&rsquo;t be undone.
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" className="mt-1 size-4" />
                  <span>I confirm the seller has accepted and the pool should be locked.</span>
                </label>
                <Button type="submit" size="sm" className="mt-3">
                  Lock pool and create orders
                </Button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}

      {life.orders.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-xl">Orders</h3>
          <p className="text-ink-muted mt-1 text-sm">
            Final price {pool.finalUnitPricePaise ? formatINR(paise(pool.finalUnitPricePaise)) : "—"} per{" "}
            {pool.unitLabel} · {adjustments.length} price-adjustment refund{adjustments.length === 1 ? "" : "s"}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">Orders for this pool</caption>
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th scope="col" className="py-2">
                    Member
                  </th>
                  <th scope="col">Qty</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Shipment</th>
                </tr>
              </thead>
              <tbody>
                {life.orders.map((o) => (
                  <tr key={o.id} className="border-rule border-t align-top">
                    <td className="py-2">{o.member}</td>
                    <td>{o.quantity}</td>
                    <td className="font-mono">{formatINR(paise(o.amountPaise))}</td>
                    <td>
                      <Badge>{o.status}</Badge>
                    </td>
                    <td className="py-2">
                      {o.shipment ? (
                        <p>
                          {o.shipment.carrier} · {o.shipment.trackingNumber}
                        </p>
                      ) : null}
                      {canShip && o.status === "CREATED" ? (
                        <form action={shipOrderAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="orderId" value={o.id} />
                          <input
                            name="carrier"
                            aria-label={`Carrier for ${o.member}`}
                            placeholder="Carrier"
                            className={`${input} w-28`}
                          />
                          <input
                            name="tracking"
                            aria-label={`Tracking number for ${o.member}`}
                            placeholder="Tracking no."
                            className={`${input} w-32`}
                          />
                          <input
                            name="trackingUrl"
                            aria-label={`Tracking link for ${o.member}`}
                            placeholder="https://… (optional)"
                            className={`${input} w-40`}
                          />
                          <Button type="submit" size="sm" variant="secondary">
                            Mark shipped
                          </Button>
                        </form>
                      ) : null}
                      {canShip && o.status === "SHIPPED" ? (
                        <form action={markDeliveredAction} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="orderId" value={o.id} />
                          <input
                            name="note"
                            aria-label={`Delivery evidence for ${o.member}`}
                            placeholder="Evidence, e.g. courier POD"
                            className={`${input} w-48`}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            Mark delivered
                          </Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
