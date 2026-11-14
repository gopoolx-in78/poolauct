"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CMS_TAGS } from "@/modules/cms/server/queries";
import { DOCUMENT_FIELDS, documentSchema, faqSchema } from "@/modules/cms/validation";
import { requireStaff } from "@/modules/core/server/auth";
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

const FEATURED_PATH = "/admin/content/featured";
const featuredModule = (formData: FormData) => (str(formData, "module") === "auction" ? "auction" : "poolx");

/** Features a pool or auction on the homepage (TD-76). Takes effect immediately; the change is audited. */
export async function addFeaturedAction(formData: FormData) {
  await requireStaff(FEATURED_PATH, "cms.content.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_featured_add", {
    p_module: featuredModule(formData),
    p_slug: str(formData, "slug").slice(0, 120),
  });
  if (!error) updateTag(CMS_TAGS.featured);
  redirect(outcome(FEATURED_PATH, error, "featured-added"));
}

export async function moveFeaturedAction(formData: FormData) {
  await requireStaff(FEATURED_PATH, "cms.content.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_featured_move", {
    p_id: str(formData, "id"),
    p_move: str(formData, "move") === "down" ? "down" : "up",
  });
  if (!error) updateTag(CMS_TAGS.featured);
  redirect(outcome(FEATURED_PATH, error, "featured-moved"));
}

export async function removeFeaturedAction(formData: FormData) {
  await requireStaff(FEATURED_PATH, "cms.content.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_featured_remove", { p_id: str(formData, "id") });
  if (!error) updateTag(CMS_TAGS.featured);
  redirect(outcome(FEATURED_PATH, error, "featured-removed"));
}
