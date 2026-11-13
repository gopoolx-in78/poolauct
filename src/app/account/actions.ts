"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { recordSecurityEvent } from "@/modules/core/server/request";
import { site } from "@/config/site";
import { emailSchema, fieldErrors, profileSchema, totpCodeSchema, type FormState } from "@/modules/core/validation";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccount("/account/profile");
  const raw = { displayName: str(formData, "displayName"), city: str(formData, "city"), state: str(formData, "state") };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values: raw };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("update_my_profile", {
    p_display_name: parsed.data.displayName,
    p_city: parsed.data.city,
    p_state: parsed.data.state,
  });
  if (error) {
    console.error("update_my_profile failed", { code: error.code });
    return { status: "error", message: "We couldn’t save your profile. Please try again.", values: raw };
  }
  revalidatePath("/account", "layout");
  return { status: "success", message: "Profile saved.", values: raw };
}

// ---------------------------------------------------------------------------
// Email change (double-confirmed by the auth server; profile email syncs via trigger once confirmed)
// ---------------------------------------------------------------------------
export async function changeEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const account = await requireAccount("/account/security");
  const raw = str(formData, "email");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success)
    return { status: "error", fieldErrors: { email: parsed.error.issues[0]?.message }, values: { email: raw } };
  if (parsed.data === account.email.toLowerCase()) {
    return { status: "error", fieldErrors: { email: "That’s already your email address." }, values: { email: raw } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: new URL("/auth/confirm?next=/account/profile", site.url).toString() },
  );
  if (error && error.code !== "email_exists") {
    console.error("email change failed", { code: error.code });
    return { status: "error", message: "We couldn’t start the email change. Please try again later." };
  }
  // Same response whether or not the address is already registered (no enumeration).
  return { status: "success", message: "Check both your current and new inboxes to confirm the change." };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
const sessionIdSchema = z.uuid();

export async function revokeSessionAction(formData: FormData) {
  await requireAccount("/account/sessions");
  const parsed = sessionIdSchema.safeParse(str(formData, "sessionId"));
  if (!parsed.success) redirect("/account/sessions?notice=invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("revoke_my_session", { p_session_id: parsed.data });
  redirect(`/account/sessions?notice=${error ? "failed" : "revoked"}`);
}

export async function signOutOtherSessionsAction() {
  await requireAccount("/account/sessions");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  redirect(`/account/sessions?notice=${error ? "failed" : "others-signed-out"}`);
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------
export async function requestDeletionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccount("/account/delete");
  const reason = str(formData, "reason").trim();
  if (str(formData, "confirm") !== "on") {
    return { status: "error", fieldErrors: { confirm: "Please confirm that you understand." }, values: { reason } };
  }
  if (reason.length > 1000) {
    return { status: "error", fieldErrors: { reason: "Use at most 1000 characters." }, values: { reason } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("request_account_deletion", { p_reason: reason || null });
  if (error)
    return { status: "error", message: "We couldn’t submit your request. Please try again.", values: { reason } };
  revalidatePath("/account", "layout");
  redirect("/account?notice=deletion-requested");
}

export async function cancelDeletionAction() {
  await requireAccount("/account");
  const supabase = await createSupabaseServerClient();
  await supabase.schema("api").rpc("cancel_account_deletion");
  revalidatePath("/account", "layout");
  redirect("/account?notice=deletion-cancelled");
}

// ---------------------------------------------------------------------------
// MFA (TOTP)
// ---------------------------------------------------------------------------
export type EnrollState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "enrolling"; factorId: string; qrCode: string; secret: string };

export async function startTotpEnrollmentAction(): Promise<EnrollState> {
  await requireAccount("/account/security");
  const supabase = await createSupabaseServerClient();

  // Remove abandoned, unverified factors first so a fresh QR code can be issued.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  if ((factors?.totp ?? []).some((f) => f.status === "verified")) {
    return { status: "error", message: "An authenticator app is already set up for this account." };
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) {
    console.error("mfa enroll failed", { code: error?.code });
    return { status: "error", message: "We couldn’t start authenticator setup. Please try again." };
  }
  return { status: "enrolling", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a TOTP code for a factor (first-time enrolment or step-up). Upgrades the session to aal2. */
export async function verifyTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const account = await requireAccount("/account/security");
  const parsed = totpCodeSchema.safeParse({ code: str(formData, "code") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const factorId = z.uuid().safeParse(str(formData, "factorId"));
  if (!factorId.success) return { status: "error", message: "Please restart authenticator setup." };

  const supabase = await createSupabaseServerClient();
  const wasEnrolment = str(formData, "mode") === "enrol";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: parsed.data.code });
  if (error) {
    await recordSecurityEvent("MFA_VERIFY_FAILED", account.id);
    return { status: "error", fieldErrors: { code: "That code didn’t work. Check your app and try again." } };
  }
  if (wasEnrolment) await recordSecurityEvent("MFA_ENROLLED", account.id);
  revalidatePath("/", "layout");
  redirect(safeNextPath(str(formData, "next"), "/account/security?notice=mfa-verified"));
}
