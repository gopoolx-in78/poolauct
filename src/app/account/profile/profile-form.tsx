"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { updateProfileAction } from "../actions";

export function ProfileForm({ initial }: { initial: { displayName: string; city: string; state: string } }) {
  const [state, action] = useActionState(updateProfileAction, { ...idleState, values: initial });
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField name="displayName" label="Name" autoComplete="name" maxLength={80} state={state} />
      <TextField name="city" label="City" autoComplete="address-level2" maxLength={80} state={state} />
      <TextField name="state" label="State" autoComplete="address-level1" maxLength={80} state={state} />
      <SubmitButton className="self-start">Save profile</SubmitButton>
    </form>
  );
}
