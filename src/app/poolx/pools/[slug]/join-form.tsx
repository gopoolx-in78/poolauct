"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form-kit";
import { formatINR, paise } from "@/lib/money";
import { feeFor } from "@/modules/poolx/pricing";
import { idleState } from "@/modules/core/validation";
import { joinPoolAction } from "../../actions";

export function JoinForm(props: {
  poolId: string;
  slug: string;
  minQty: number;
  maxQty: number;
  unitLabel: string;
  unitPricePaise: string;
  feeBps: number;
  resume?: boolean;
  defaultQty?: number;
}) {
  const [state, action] = useActionState(joinPoolAction, idleState);
  const [qty, setQty] = useState(props.defaultQty ?? props.minQty);
  const unit = paise(props.unitPricePaise);
  const subtotal = paise(unit * BigInt(qty));
  const fee = feeFor(subtotal, props.feeBps);
  const options = Array.from({ length: Math.min(props.maxQty - props.minQty + 1, 50) }, (_, i) => props.minQty + i);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="poolId" value={props.poolId} />
      <input type="hidden" name="slug" value={props.slug} />
      {options.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Quantity ({props.unitLabel}s)
          <select
            name="quantity"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="border-rule bg-surface h-11 rounded border px-3 text-base font-normal"
            aria-describedby="qty-error"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {state.fieldErrors?.quantity ? (
            <span id="qty-error" role="alert" className="text-danger font-normal">
              {state.fieldErrors.quantity}
            </span>
          ) : null}
        </label>
      ) : (
        <input type="hidden" name="quantity" value={props.minQty} />
      )}
      <dl className="text-sm">
        <div className="flex justify-between py-1">
          <dt className="text-ink-muted">
            {qty} × {formatINR(unit)}
          </dt>
          <dd className="font-mono">{formatINR(subtotal)}</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-ink-muted">Platform fee</dt>
          <dd className="font-mono">{props.feeBps === 0 ? "None" : formatINR(fee)}</dd>
        </div>
        <div className="border-rule flex justify-between border-t py-2 font-medium">
          <dt>Estimated contribution</dt>
          <dd className="font-mono">{formatINR(paise(subtotal + fee))}</dd>
        </div>
      </dl>
      <p className="text-ink-muted text-xs">
        The exact amount is calculated securely when you continue, from the confirmed membership at that moment.
      </p>
      <SubmitButton variant="accent">{props.resume ? "Continue to payment" : "Join pool"}</SubmitButton>
    </form>
  );
}
