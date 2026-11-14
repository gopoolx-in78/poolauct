"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import type { PreferenceRow } from "./types";

const backTo = (formData: FormData) => {
  const filter = formData.get("filter") === "unread" ? "unread" : null;
  const page = Number(formData.get("page"));
  const q = new URLSearchParams();
  if (filter) q.set("filter", filter);
  if (Number.isInteger(page) && page > 1 && page < 1000) q.set("page", String(page));
  const s = q.toString();
  return `/account/notifications${s ? `?${s}` : ""}`;
};

export async function markReadAction(formData: FormData) {
  await requireAccount("/account/notifications");
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success) {
    const supabase = await createSupabaseServerClient();
    await supabase.schema("api").rpc("notifications_mark_read", { p_id: id.data });
    revalidatePath("/account/notifications");
  }
  redirect(backTo(formData));
}

export async function markAllReadAction(formData: FormData) {
  await requireAccount("/account/notifications");
  const supabase = await createSupabaseServerClient();
  await supabase.schema("api").rpc("notifications_mark_read", { p_id: null });
  revalidatePath("/account/notifications");
  redirect(backTo(formData));
}

/** Saves only what changed. The event list and "essential" flags come from the database, not the form. */
export async function savePreferencesAction(formData: FormData) {
  await requireAccount("/account/notifications/preferences");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("notifications_preferences");
  if (error || !Array.isArray(data)) redirect("/account/notifications/preferences?error=load");
  for (const p of data as PreferenceRow[]) {
    if (p.essential) continue;
    const inApp = formData.get(`inApp:${p.event}`) === "on";
    const email = formData.get(`email:${p.event}`) === "on";
    if (inApp === p.inApp && email === p.email) continue;
    const { error: saveError } = await supabase.schema("api").rpc("notifications_set_preference", {
      p_event: p.event,
      p_in_app: inApp,
      p_email: email,
    });
    if (saveError) redirect("/account/notifications/preferences?error=save");
  }
  revalidatePath("/account/notifications/preferences");
  redirect("/account/notifications/preferences?notice=saved");
}
