"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import type { FormState } from "@/modules/core/validation";
import { cn } from "@/lib/cn";

/** Submit button that disables itself while the form is pending (prevents duplicate submissions). */
export function SubmitButton({
  children,
  className,
  variant,
}: {
  children: ReactNode;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className={className} variant={variant}>
      {children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "border-l-4 px-4 py-3 text-sm",
        isError ? "border-danger bg-danger/5 text-ink" : "border-success bg-success/5 text-ink",
      )}
    >
      {state.message}
    </p>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "name" | "defaultValue"> & {
  name: string;
  label: string;
  hint?: string;
  state: FormState;
  defaultValue?: string;
};

export function TextField({ name, label, hint, state, defaultValue, required, ...inputProps }: TextFieldProps) {
  return (
    <FormField label={label} hint={hint} error={state.fieldErrors?.[name]} required={required}>
      {(a11y) => <Input name={name} defaultValue={state.values?.[name] ?? defaultValue} {...a11y} {...inputProps} />}
    </FormField>
  );
}
