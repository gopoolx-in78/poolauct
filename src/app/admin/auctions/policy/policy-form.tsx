"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { saveDepositPolicyAction } from "../actions";

export function PolicyForm({ initial }: { initial: { min: string; max: string } }) {
  const [state, action] = useActionState(saveDepositPolicyAction, { ...idleState, values: { ...initial, reason: "" } });
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="min"
        label="Minimum deposit per auction (₹)"
        required
        inputMode="decimal"
        state={state}
        defaultValue={initial.min}
        hint="Must be above ₹0. Deposits cannot be switched off."
      />
      <TextField
        name="max"
        label="Maximum deposit per auction (₹, optional)"
        inputMode="decimal"
        state={state}
        defaultValue={initial.max}
        hint="Leave blank for no cap."
      />
      <TextField name="reason" label="Reason for change" required state={state} hint="Recorded in the audit log." />
      <SubmitButton className="self-start">Save deposit policy</SubmitButton>
    </form>
  );
}
