"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState, PASSWORD_MIN } from "@/modules/core/validation";
import { signUpAction } from "../actions";

export function RegisterForm() {
  const [state, action] = useActionState(signUpAction, idleState);
  const termsError = state.fieldErrors?.acceptTerms;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField name="displayName" label="Your name" autoComplete="name" required maxLength={80} state={state} />
      <TextField name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN} characters, with upper- and lowercase letters and a number.`}
        state={state}
      />
      <TextField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        state={state}
      />
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-1 size-4"
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? "terms-error" : undefined}
          />
          <span>
            I agree to the platform terms and privacy policy. (These documents are being finalised and will be shown
            here before launch.)
          </span>
        </label>
        {termsError ? (
          <p id="terms-error" role="alert" className="text-danger mt-1 text-sm">
            {termsError}
          </p>
        ) : null}
      </div>
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
