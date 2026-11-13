"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { cancelPoolAction, createSellerAction, recordNegotiationAction, saveTiersAction } from "../actions";

export function TiersForm({ poolId, tiers }: { poolId: string; tiers: { threshold: number; discountBps: number }[] }) {
  const [state, action] = useActionState(saveTiersAction, idleState);
  const rows = Array.from({ length: 6 }, (_, i) => tiers[i]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="poolId" value={poolId} />
      <table className="text-sm">
        <caption className="sr-only">Discount tiers</caption>
        <thead className="text-ink-muted text-left text-xs uppercase">
          <tr>
            <th scope="col" className="pb-2">
              Threshold
            </th>
            <th scope="col" className="pb-2">
              Discount %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={i}>
              <td className="pr-3 pb-2">
                <input
                  aria-label={`Tier ${i + 1} threshold`}
                  name={`threshold_${i}`}
                  inputMode="numeric"
                  defaultValue={state.values?.[`threshold_${i}`] ?? t?.threshold ?? ""}
                  className="border-rule bg-surface h-10 w-28 rounded border px-2"
                />
              </td>
              <td className="pb-2">
                <input
                  aria-label={`Tier ${i + 1} discount percent`}
                  name={`discount_${i}`}
                  inputMode="decimal"
                  defaultValue={state.values?.[`discount_${i}`] ?? (t ? String(t.discountBps / 100) : "")}
                  className="border-rule bg-surface h-10 w-28 rounded border px-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SubmitButton variant="secondary" className="self-start">
        Save tiers
      </SubmitButton>
    </form>
  );
}

export function CancelPoolForm({ poolId }: { poolId: string }) {
  const [state, action] = useActionState(cancelPoolAction, idleState);
  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="poolId" value={poolId} />
      <FormField label="Reason (shown in the audit log and to members)" required error={state.fieldErrors?.reason}>
        {(a11y) => (
          <textarea
            name="reason"
            rows={2}
            defaultValue={state.values?.reason}
            className="border-rule bg-surface w-full rounded border px-3 py-2"
            {...a11y}
          />
        )}
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirm"
          className="mt-1 size-4"
          aria-describedby={state.fieldErrors?.confirm ? "cancel-confirm-err" : undefined}
        />
        <span>I understand this cancels the pool and refunds every confirmed member.</span>
      </label>
      {state.fieldErrors?.confirm ? (
        <p id="cancel-confirm-err" role="alert" className="text-danger text-sm">
          {state.fieldErrors.confirm}
        </p>
      ) : null}
      <SubmitButton variant="danger" className="self-start">
        Cancel pool and refund members
      </SubmitButton>
    </form>
  );
}

export function SellerForm() {
  const [state, action] = useActionState(createSellerAction, idleState);
  return (
    <details className="border-rule border p-4">
      <summary className="cursor-pointer text-sm font-medium">Add a seller</summary>
      <form action={action} className="mt-4 flex max-w-md flex-col gap-3">
        <FormMessage state={state} />
        <TextField name="sellerName" label="Seller display name" state={state} />
        <p className="text-ink-muted text-xs">
          New sellers are unverified. Verification is recorded separately by someone with seller-management permission.
        </p>
        <SubmitButton variant="secondary" className="self-start">
          Add seller
        </SubmitButton>
      </form>
    </details>
  );
}

export function NegotiationForm({ poolId }: { poolId: string }) {
  const [state, action] = useActionState(recordNegotiationAction, idleState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="poolId" value={poolId} />
      <TextField name="offer" label="Seller's offered price per unit (₹, optional)" inputMode="decimal" state={state} />
      <FormField
        label="Terms"
        required
        error={state.fieldErrors?.terms}
        hint="What the seller agreed or proposed (delivery, warranty, payment terms)."
      >
        {(a11y) => (
          <textarea
            name="terms"
            rows={3}
            defaultValue={v.terms}
            className="border-rule bg-surface w-full rounded border px-3 py-2"
            {...a11y}
          />
        )}
      </FormField>
      <FormField label="Outcome" required error={state.fieldErrors?.outcome}>
        {(a11y) => (
          <select
            name="outcome"
            defaultValue={v.outcome ?? "PROPOSED"}
            className="border-rule bg-surface h-11 w-full rounded border px-3"
            {...a11y}
          >
            <option value="PROPOSED">Proposed</option>
            <option value="ACCEPTED">Accepted by seller</option>
            <option value="REJECTED">Rejected</option>
          </select>
        )}
      </FormField>
      <SubmitButton variant="secondary" className="self-start">
        Record negotiation
      </SubmitButton>
    </form>
  );
}
