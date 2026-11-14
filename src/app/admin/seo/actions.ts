"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CMS_TAGS, SEO_ROUTES } from "@/modules/cms/server/queries";
import { seoSchema } from "@/modules/cms/validation";
import { outcome, str } from "../action-kit";

export async function saveSeoAction(formData: FormData) {
  const route = SEO_ROUTES.find((r) => r === str(formData, "route"));
  if (!route) redirect("/admin/seo?error=Unknown%20page");
  const parsed = seoSchema.safeParse({ title: str(formData, "title"), description: str(formData, "description") });
  if (!parsed.success) {
    redirect(`/admin/seo?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the values")}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("cms_admin_save_seo", {
    p_route: route,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
  });
  if (!error) updateTag(CMS_TAGS.seo);
  redirect(outcome("/admin/seo", error, "saved"));
}
