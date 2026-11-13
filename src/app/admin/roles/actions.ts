"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { outcome, str } from "../action-kit";

export async function setRolePermissionAction(formData: FormData) {
  await requireStaff("/admin/roles", "roles.manage");
  const granted = z.enum(["grant", "revoke"]).parse(str(formData, "change")) === "grant";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("admin_set_role_permission", {
    p_role: str(formData, "role"),
    p_permission: str(formData, "permission"),
    p_granted: granted,
    p_reason: str(formData, "reason"),
  });
  redirect(outcome("/admin/roles", error, granted ? "permission-granted" : "permission-revoked"));
}
