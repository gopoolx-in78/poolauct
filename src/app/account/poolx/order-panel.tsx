import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { confirmDeliveryAction, openDisputeAction } from "@/app/poolx/actions";

export type MemberOrder = {
  id: string;
  status: string;
  amountPaise: string;
  unitPricePaise: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  shipment: { carrier: string; trackingNumber: string; trackingUrl: string | null } | null;
  dispute: { status: string; reason: string; resolutionNote: string | null } | null;
};

const ORDER_LABEL: Record<string, string> = {
  CREATED: "Order placed — awaiting dispatch",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  DISPUTED: "Problem reported",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

/** The member's order after the pool locked: price, shipment, delivery confirmation and problem reporting. */
export function OrderPanel({
  order,
  unitLabel,
  quantity,
  reportOpen,
}: {
  order: MemberOrder;
  unitLabel: string;
  quantity: number;
  reportOpen: boolean;
}) {
  const canReport = ["CREATED", "SHIPPED", "DELIVERED"].includes(order.status) && order.dispute?.status !== "OPEN";
  return (
    <div className="border-rule mt-4 border-t pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Your order</span>
        <Badge tone={order.status === "DELIVERED" ? "success" : order.status === "DISPUTED" ? "warning" : "neutral"}>
          {ORDER_LABEL[order.status] ?? order.status}
        </Badge>
      </div>
      <p className="mt-2">
        Final price <span className="font-mono">{formatINR(paise(order.unitPricePaise))}</span> per {unitLabel} ×{" "}
        {quantity} — order total <span className="font-mono">{formatINR(paise(order.amountPaise))}</span>. Any
        difference from what you paid is refunded below.
      </p>
      {order.shipment ? (
        <p className="mt-2">
          Shipped {order.shippedAt ? formatIST(order.shippedAt) : ""} via {order.shipment.carrier}, tracking{" "}
          {order.shipment.trackingUrl ? (
            <a
              href={order.shipment.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {order.shipment.trackingNumber}
            </a>
          ) : (
            <span className="font-mono">{order.shipment.trackingNumber}</span>
          )}
          .
        </p>
      ) : null}
      {order.deliveredAt ? <p className="mt-2">Delivered {formatIST(order.deliveredAt)}.</p> : null}
      {order.dispute ? (
        <p className="mt-2">
          Problem report:{" "}
          {order.dispute.status === "OPEN"
            ? "under review"
            : order.dispute.status === "RESOLVED_REFUND"
              ? "resolved with a refund"
              : "resolved"}
          {order.dispute.resolutionNote ? ` — ${order.dispute.resolutionNote}` : ""}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3">
        {order.status === "SHIPPED" ? (
          <form action={confirmDeliveryAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" size="sm">
              Confirm delivery
            </Button>
          </form>
        ) : null}
      </div>

      {canReport ? (
        reportOpen ? (
          <form action={openDisputeAction} className="border-warning bg-warning/5 mt-3 border-l-4 p-3">
            <input type="hidden" name="orderId" value={order.id} />
            <label className="flex flex-col gap-1">
              What went wrong?
              <textarea
                name="reason"
                rows={3}
                minLength={10}
                maxLength={2000}
                className="border-rule bg-surface rounded border px-3 py-2"
              />
            </label>
            <Button type="submit" size="sm" variant="secondary" className="mt-2">
              Report problem
            </Button>
          </form>
        ) : (
          <a href={`/account/poolx?report=${order.id}`} className="mt-3 inline-block underline underline-offset-4">
            Report a problem…
          </a>
        )
      ) : null}
    </div>
  );
}
