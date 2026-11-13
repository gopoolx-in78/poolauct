"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { submitPoolRequestAction } from "../actions";

export function RequestForm({ categories }: { categories: { slug: string; name: string }[] }) {
  const [state, action] = useActionState(submitPoolRequestAction, idleState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="title"
        label="Request title"
        required
        maxLength={120}
        state={state}
        hint="e.g. Laptops for our office team"
      />
      <TextField name="product" label="Product or service" required maxLength={120} state={state} />
      <FormField
        label="What do you need?"
        required
        error={state.fieldErrors?.description}
        hint="Specifications, brands you’d accept, anything sellers should know."
      >
        {(a11y) => (
          <textarea
            name="description"
            rows={5}
            maxLength={3000}
            defaultValue={v.description}
            className="border-rule bg-surface w-full rounded border px-3 py-2"
            {...a11y}
          />
        )}
      </FormField>
      <FormField label="Category" error={state.fieldErrors?.category}>
        {(a11y) => (
          <select
            name="category"
            defaultValue={v.category ?? ""}
            className="border-rule bg-surface h-11 w-full rounded border px-3"
            {...a11y}
          >
            <option value="">Not sure</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="estimatedQuantity" label="Estimated total quantity" inputMode="numeric" state={state} />
        <TextField name="targetParticipants" label="Expected participants" inputMode="numeric" state={state} />
      </div>
      <TextField
        name="expectedUnitPrice"
        label="Expected price per unit (₹, optional)"
        inputMode="decimal"
        state={state}
      />
      <FormField label="Specifications (optional)" error={state.fieldErrors?.specifications}>
        {(a11y) => (
          <textarea
            name="specifications"
            rows={3}
            maxLength={2000}
            defaultValue={v.specifications}
            className="border-rule bg-surface w-full rounded border px-3 py-2"
            {...a11y}
          />
        )}
      </FormField>
      <TextField name="preferredSeller" label="Preferred seller (optional)" maxLength={120} state={state} />
      <TextField
        name="deliveryLocation"
        label="Delivery location"
        required
        maxLength={200}
        state={state}
        hint="City and area, or PIN code"
      />
      <TextField name="neededBy" label="Needed by (optional)" type="date" state={state} />
      <SubmitButton variant="accent" className="self-start">
        Submit request
      </SubmitButton>
    </form>
  );
}
