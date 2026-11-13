"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState, type FormState } from "@/modules/core/validation";
import { signInAction } from "../actions";

const notices: Record<string, FormState> = {
  link: { status: "error", message: "That link is invalid or has expired. Please request a new one." },
  inactive: { status: "error", message: "This account is not active. Please contact support." },
};

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signInAction, idleState);
  const notice = notices[params.get("error") ?? ""];
  const shown = state.status === "idle" && notice ? notice : state;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={shown} />
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <TextField name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <div className="flex items-center justify-between gap-4">
        <SubmitButton>Sign in</SubmitButton>
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
