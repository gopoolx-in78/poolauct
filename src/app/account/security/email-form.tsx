"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { changeEmailAction } from "../actions";

export function EmailChangeForm() {
  const [state, action] = useActionState(changeEmailAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField name="email" label="New email address" type="email" autoComplete="email" required state={state} />
      <SubmitButton className="self-start" variant="secondary">
        Change email
      </SubmitButton>
    </form>
  );
}
