"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { outcome, str } from "../action-kit";

export async function retryDeliveryAction(formData: FormData) {
  await requireStaff("/admin/notifications", "support.tickets");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("admin_retry_notification_delivery", {
    p_delivery: str(formData, "id"),
    p_reason: str(formData, "reason"),
  });
  const back = str(formData, "back");
  redirect(outcome(back.startsWith("/admin/notifications") ? back : "/admin/notifications", error, "queued"));
}
