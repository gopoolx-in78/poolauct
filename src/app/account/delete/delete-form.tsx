"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { requestDeletionAction } from "../actions";

export function DeleteForm() {
  const [state, action] = useActionState(requestDeletionAction, idleState);
  const confirmError = state.fieldErrors?.confirm;
  return (
    <form action={action} className="flex flex-col gap-5 pt-2" noValidate>
      <FormMessage state={state} />
      <FormField label="Reason (optional)" error={state.fieldErrors?.reason}>
        {(a11y) => (
          <textarea
            name="reason"
            rows={3}
            maxLength={1000}
            defaultValue={state.values?.reason}
            className="border-rule bg-surface w-full rounded border px-3 py-2"
            {...a11y}
          />
        )}
      </FormField>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="confirm"
            className="mt-1 size-4"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "confirm-error" : undefined}
          />
          <span>I understand that my account will be deleted after review.</span>
        </label>
        {confirmError ? (
          <p id="confirm-error" role="alert" className="text-danger mt-1 text-sm">
            {confirmError}
          </p>
        ) : null}
      </div>
      <SubmitButton variant="danger" className="self-start">
        Request account deletion
      </SubmitButton>
    </form>
  );
}
