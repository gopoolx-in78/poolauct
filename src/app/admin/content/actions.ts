"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CMS_TAGS } from "@/modules/cms/server/queries";
import { DOCUMENT_FIELDS, documentSchema, faqSchema } from "@/modules/cms/validation";
import { fieldErrors, type FormState } from "@/modules/core/validation";
import { outcome, sqlMessage, str } from "../action-kit";

/** Creates a page / post or saves a new revision. Published content changes only when it is published again. */
export async function saveDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(DOCUMENT_FIELDS.map((k) => [k, str(formData, k)]));
  const parsed = documentSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
      values,
    };
  }
  const d = parsed.data;
  const id = str(formData, "id") || null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("cms_admin_save_document", {
    p_id: id,
    p_kind: d.kind,
    p_slug: d.slug,
    p_title: d.title,
    p_summary: d.summary,
    p_body: d.body,
    p_seo_title: d.seoTitle,
    p_seo_description: d.seoDescription,
    p_note: d.note,
  });
  if (error) return { status: "error", message: sqlMessage(error.message), values };
  redirect(`/admin/content/${data as string}?notice=saved`);
}

export async function documentStatusAction(formData: FormData) {
  const id = str(formData, "id");
  const action = str(formData, "action");
  const revision = Number(str(formData, "revision")) || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_document_action", {
    p_id: id,
    p_action: action,
    p_revision: revision,
    p_reason: str(formData, "reason") || null,
  });
  if (!error) updateTag(CMS_TAGS.docs);
  redirect(outcome(`/admin/content/${id}`, error, action.toLowerCase()));
}

export async function saveFaqAction(formData: FormData) {
  const parsed = faqSchema.safeParse({
    topic: str(formData, "topic"),
    question: str(formData, "question"),
    answer: str(formData, "answer"),
    sort: str(formData, "sort") || "100",
    status: str(formData, "status"),
  });
  if (!parsed.success) {
    redirect(`/admin/content/faqs?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the FAQ")}`);
  }
  const f = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_save_faq", {
    p_id: str(formData, "id") || null,
    p_topic: f.topic,
    p_question: f.question,
    p_answer: f.answer,
    p_sort: f.sort,
    p_status: f.status,
  });
  if (!error) updateTag(CMS_TAGS.faqs);
  redirect(outcome("/admin/content/faqs", error, "faq-saved"));
}
