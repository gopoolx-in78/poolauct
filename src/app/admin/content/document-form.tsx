"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState, type FormState } from "@/modules/core/validation";
import { saveDocumentAction } from "./actions";

export type DocumentDefaults = {
  id: string | null;
  kind: "PAGE" | "POST";
  slug: string;
  title: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  slugLocked: boolean;
};

export function DocumentForm({ d }: { d: DocumentDefaults }) {
  const [state, action] = useActionState<FormState, FormData>(saveDocumentAction, idleState);
  const v = (k: keyof DocumentDefaults) => state.values?.[k] ?? String(d[k] ?? "");
  const base = d.kind === "POST" ? "/blog/" : "/info/";
  return (
    <form action={action} className="grid max-w-3xl gap-5" noValidate>
      <input type="hidden" name="id" value={d.id ?? ""} />
      <input type="hidden" name="kind" value={d.kind} />
      <FormMessage state={state} />
      <TextField name="title" label="Title" required state={state} defaultValue={d.title} maxLength={120} />
      {d.slugLocked ? (
        <>
          <input type="hidden" name="slug" value={d.slug} />
          <p className="text-sm">
            <span className="font-medium">Web address:</span>{" "}
            <span className="font-mono">
              {base}
              {d.slug}
            </span>{" "}
            <span className="text-ink-muted">(fixed after first publication)</span>
          </p>
        </>
      ) : (
        <TextField
          name="slug"
          label="Web address"
          hint={`Shown as ${base}your-address — lowercase letters, numbers and hyphens.`}
          required
          state={state}
          defaultValue={d.slug}
          maxLength={80}
          className="font-mono"
        />
      )}
      <TextField
        name="summary"
        label="Summary"
        hint="One line shown in lists and under the title."
        state={state}
        defaultValue={d.summary}
        maxLength={300}
      />
      <FormField
        label="Content"
        hint="Markdown: ## headings, **bold**, *italic*, lists, > quotes and [links](/poolx). Images: upload them under “Article images” and paste the code shown there. HTML and other images are removed."
        error={state.fieldErrors?.body}
        required
      >
        {(a11y) => (
          <textarea
            name="body"
            defaultValue={v("body")}
            rows={18}
            maxLength={50000}
            className="border-rule bg-surface rounded border px-3 py-2 font-mono text-sm"
            {...a11y}
          />
        )}
      </FormField>
      <details className="border-rule rounded border p-4">
        <summary className="cursor-pointer font-medium">Search engine settings (optional)</summary>
        <div className="mt-4 grid gap-4">
          <TextField
            name="seoTitle"
            label="Search title"
            hint="10–70 characters. Defaults to the title."
            state={state}
            defaultValue={d.seoTitle}
            maxLength={70}
          />
          <TextField
            name="seoDescription"
            label="Search description"
            hint="50–160 characters. Defaults to the summary."
            state={state}
            defaultValue={d.seoDescription}
            maxLength={160}
          />
        </div>
      </details>
      <TextField
        name="note"
        label="Change note (optional, kept with this revision)"
        state={state}
        defaultValue=""
        maxLength={200}
      />
      <SubmitButton className="justify-self-start">{d.id ? "Save new revision" : "Create draft"}</SubmitButton>
      <p className="text-ink-muted text-sm">
        Saving never changes what visitors see. Publish the revision when it is ready.
      </p>
    </form>
  );
}
