"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CMS_TAGS } from "@/modules/cms/server/queries";
import { themeConfigSchema } from "@/modules/theme/schema";
import { outcome, sqlMessage, str } from "../action-kit";

export type DraftState = { error?: string; issues?: string[]; savedAt?: string };

/** Saves the working draft. Validated here for friendly messages and again by the database (allowlist + contrast). */
export async function saveThemeDraftAction(_prev: DraftState, formData: FormData): Promise<DraftState> {
  let raw: unknown;
  try {
    raw = JSON.parse(str(formData, "config"));
  } catch {
    return { error: "The design could not be read. Reload the page and try again." };
  }
  const parsed = themeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Fix the highlighted problems before saving.",
      issues: parsed.error.issues.slice(0, 12).map((i) => i.message),
    };
  }
  const label = str(formData, "label").trim();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_theme_save_draft", { p_config: parsed.data, p_label: label });
  if (error) return { error: sqlMessage(error.message) };
  return { savedAt: new Date().toISOString() };
}

export async function publishThemeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_theme_publish", { p_note: str(formData, "note") });
  if (!error) updateTag(CMS_TAGS.site);
  redirect(outcome("/admin/theme", error, "published"));
}

export async function discardThemeDraftAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_theme_discard_draft", { p_reason: str(formData, "reason") });
  redirect(outcome("/admin/theme", error, "discarded"));
}

export async function rollbackThemeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("cms_theme_rollback", { p_version: Number(str(formData, "version")), p_reason: str(formData, "reason") });
  if (!error) updateTag(CMS_TAGS.site);
  redirect(outcome("/admin/theme", error, "restored"));
}
