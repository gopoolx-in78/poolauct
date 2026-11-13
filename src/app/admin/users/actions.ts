"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { outcome, str } from "../action-kit";

const userId = (formData: FormData) => z.uuid().parse(str(formData, "userId"));

export async function setUserStatusAction(formData: FormData) {
  const id = userId(formData);
  await requireStaff(`/admin/users/${id}`, "users.suspend");
  const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(str(formData, "status"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("admin_set_user_status", { p_user: id, p_status: status, p_reason: str(formData, "reason") });
  redirect(outcome(`/admin/users/${id}`, error, status === "SUSPENDED" ? "suspended" : "reactivated"));
}

export async function revokeUserSessionsAction(formData: FormData) {
  const id = userId(formData);
  await requireStaff(`/admin/users/${id}`, "users.sessions.revoke");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("admin_revoke_user_sessions", { p_user: id, p_reason: str(formData, "reason") });
  redirect(outcome(`/admin/users/${id}`, error, "sessions-revoked"));
}

export async function grantRoleAction(formData: FormData) {
  const id = userId(formData);
  await requireStaff(`/admin/users/${id}`, "roles.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("admin_grant_role", { p_user: id, p_role: str(formData, "role"), p_reason: str(formData, "reason") });
  redirect(outcome(`/admin/users/${id}`, error, "role-granted"));
}

export async function revokeRoleAction(formData: FormData) {
  const id = userId(formData);
  await requireStaff(`/admin/users/${id}`, "roles.manage");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc("admin_revoke_role", { p_user: id, p_role: str(formData, "role"), p_reason: str(formData, "reason") });
  redirect(outcome(`/admin/users/${id}`, error, "role-revoked"));
}
