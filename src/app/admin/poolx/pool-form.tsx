"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { savePoolAction } from "./actions";

export type PoolFormValues = Record<
  | "slug"
  | "title"
  | "summary"
  | "description"
  | "productName"
  | "specs"
  | "categorySlug"
  | "sellerId"
  | "unitLabel"
  | "basePrice"
  | "referencePrice"
  | "referenceSource"
  | "tierBasis"
  | "minQty"
  | "maxQty"
  | "minMembers"
  | "targetMembers"
  | "maxMembers"
  | "platformFeePercent"
  | "withdrawalPolicy"
  | "terms"
  | "deliveryNote"
  | "startsAt"
  | "deadlineAt",
  string
>;

export function PoolForm({
  poolId,
  initial,
  categories,
  sellers,
}: {
  poolId?: string;
  initial: PoolFormValues;
  categories: { slug: string; name: string }[];
  sellers: { id: string; name: string; verificationStatus: string }[];
}) {
  const [state, action] = useActionState(savePoolAction, { ...idleState, values: initial });
  const v = state.values ?? initial;
  const err = state.fieldErrors ?? {};
  const area = (name: keyof PoolFormValues, label: string, rows: number, hint?: string, required?: boolean) => (
    <FormField label={label} hint={hint} error={err[name]} required={required}>
      {(a11y) => (
        <textarea
          name={name}
          rows={rows}
          defaultValue={v[name]}
          className="border-rule bg-surface w-full rounded border px-3 py-2"
          {...a11y}
        />
      )}
    </FormField>
  );
  const select = (
    name: keyof PoolFormValues,
    label: string,
    options: { value: string; label: string }[],
    required?: boolean,
  ) => (
    <FormField label={label} error={err[name]} required={required}>
      {(a11y) => (
        <select
          name={name}
          defaultValue={v[name]}
          className="border-rule bg-surface h-11 w-full rounded border px-3"
          {...a11y}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {poolId ? <input type="hidden" name="poolId" value={poolId} /> : null}
      <fieldset className="grid gap-5 md:grid-cols-2">
        <legend className="font-display mb-2 text-xl">Listing</legend>
        <TextField name="title" label="Title" required state={state} defaultValue={v.title} />
        <TextField
          name="slug"
          label="URL slug"
          required
          state={state}
          defaultValue={v.slug}
          hint="lowercase-with-hyphens; fixed once published"
        />
        <div className="md:col-span-2">
          <TextField name="summary" label="Summary" required state={state} defaultValue={v.summary} maxLength={240} />
        </div>
        <TextField name="productName" label="Product name" required state={state} defaultValue={v.productName} />
        {select(
          "categorySlug",
          "Category",
          [{ value: "", label: "Choose…" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))],
          true,
        )}
        <div className="md:col-span-2">{area("description", "Description", 5)}</div>
        <div className="md:col-span-2">{area("specs", "Specifications", 4, "One per line: Label: value")}</div>
      </fieldset>

      <fieldset className="grid gap-5 md:grid-cols-3">
        <legend className="font-display mb-2 text-xl">Pricing</legend>
        <TextField
          name="basePrice"
          label="Base price per unit (₹)"
          required
          inputMode="decimal"
          state={state}
          defaultValue={v.basePrice}
        />
        <TextField
          name="unitLabel"
          label="Unit label"
          required
          state={state}
          defaultValue={v.unitLabel}
          hint="e.g. unit, bag, tonne"
        />
        <TextField
          name="platformFeePercent"
          label="Platform fee (%)"
          inputMode="decimal"
          state={state}
          defaultValue={v.platformFeePercent}
          hint="Disclosed to members; 0 if none"
        />
        <TextField
          name="referencePrice"
          label="Reference price (₹, optional)"
          inputMode="decimal"
          state={state}
          defaultValue={v.referencePrice}
        />
        <div className="md:col-span-2">
          <TextField
            name="referenceSource"
            label="Reference price source"
            state={state}
            defaultValue={v.referenceSource}
            hint="Required with a reference price, e.g. “Manufacturer MRP, Nov 2026”"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-5 md:grid-cols-3">
        <legend className="font-display mb-2 text-xl">Membership</legend>
        {select("tierBasis", "Tiers are based on", [
          { value: "MEMBERS", label: "Confirmed members" },
          { value: "QUANTITY", label: "Total quantity" },
        ])}
        <TextField
          name="minQty"
          label="Min quantity per member"
          required
          inputMode="numeric"
          state={state}
          defaultValue={v.minQty}
        />
        <TextField
          name="maxQty"
          label="Max quantity per member"
          required
          inputMode="numeric"
          state={state}
          defaultValue={v.maxQty}
        />
        <TextField
          name="minMembers"
          label="Minimum members to proceed"
          required
          inputMode="numeric"
          state={state}
          defaultValue={v.minMembers}
        />
        <TextField
          name="targetMembers"
          label="Target members"
          required
          inputMode="numeric"
          state={state}
          defaultValue={v.targetMembers}
        />
        <TextField
          name="maxMembers"
          label="Maximum members (optional)"
          inputMode="numeric"
          state={state}
          defaultValue={v.maxMembers}
        />
        <TextField
          name="startsAt"
          label="Opens (IST)"
          type="datetime-local"
          required
          state={state}
          defaultValue={v.startsAt}
        />
        <TextField
          name="deadlineAt"
          label="Deadline (IST)"
          type="datetime-local"
          required
          state={state}
          defaultValue={v.deadlineAt}
        />
        {select("sellerId", "Seller", [
          { value: "", label: "Not assigned yet" },
          ...sellers.map((s) => ({
            value: s.id,
            label: `${s.name}${s.verificationStatus === "VERIFIED" ? " (verified)" : ""}`,
          })),
        ])}
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="font-display mb-2 text-xl">Rules shown to members</legend>
        {area("withdrawalPolicy", "Withdrawal policy", 2, undefined, true)}
        {area("terms", "Pool terms", 4)}
        <TextField
          name="deliveryNote"
          label="Delivery note"
          state={state}
          defaultValue={v.deliveryNote}
          maxLength={500}
        />
      </fieldset>

      <SubmitButton className="self-start">{poolId ? "Save draft" : "Create draft"}</SubmitButton>
    </form>
  );
}
