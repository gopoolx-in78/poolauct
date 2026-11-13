"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState, PASSWORD_MIN } from "@/modules/core/validation";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN} characters, with upper- and lowercase letters and a number.`}
        state={state}
      />
      <TextField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        state={state}
      />
      <SubmitButton>Save new password</SubmitButton>
    </form>
  );
}
