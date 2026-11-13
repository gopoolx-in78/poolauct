"use server";

import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIp, recordSecurityEvent, subjectHash, withinRateLimits } from "@/modules/core/server/request";
import {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "@/modules/core/validation";

const GENERIC_SIGN_IN_ERROR = "That email and password combination didn’t work.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: str(formData, "email"), password: str(formData, "password") });
  const values = { email: str(formData, "email") };
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientIp();
  const emailHash = subjectHash("email", parsed.data.email);
  const allowed = await withinRateLimits([
    { bucket: `signin:ip:${subjectHash("ip", ip)}`, max: 30, windowSeconds: 900 },
    { bucket: `signin:email:${emailHash}`, max: 8, windowSeconds: 900 },
  ]);
  if (!allowed) {
    await recordSecurityEvent("SIGN_IN_RATE_LIMITED", null, emailHash);
    return { status: "error", message: RATE_LIMITED, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    await recordSecurityEvent("SIGN_IN_FAILED", null, emailHash);
    if (error?.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email address first — check your inbox for the link.",
        values,
      };
    }
    return { status: "error", message: GENERIC_SIGN_IN_ERROR, values };
  }

  const { data: account } = await supabase.schema("api").rpc("get_my_account");
  const status = (account as { status?: string } | null)?.status;
  if (status === "SUSPENDED" || status === "DELETED") {
    await supabase.auth.signOut();
    return { status: "error", message: "This account is not active. Please contact support.", values };
  }

  redirect(safeNextPath(str(formData, "next")));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    displayName: str(formData, "displayName"),
    email: str(formData, "email"),
    password: str(formData, "password"),
    confirmPassword: str(formData, "confirmPassword"),
    acceptTerms: str(formData, "acceptTerms") || undefined,
  };
  const values = { displayName: raw.displayName, email: raw.email };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientIp();
  const allowed = await withinRateLimits([
    { bucket: `signup:ip:${subjectHash("ip", ip)}`, max: 10, windowSeconds: 3600 },
  ]);
  if (!allowed) {
    await recordSecurityEvent("SIGN_UP_RATE_LIMITED", null, subjectHash("ip", ip));
    return { status: "error", message: RATE_LIMITED, values };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: new URL("/auth/confirm", site.url).toString(),
    },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." }, values };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { status: "error", message: RATE_LIMITED, values };
    }
    // Any other error (including an existing account) gets the same response to prevent account enumeration.
    console.error("sign-up error", { code: error.code });
  }
  redirect("/verify-email");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: str(formData, "email") });
  const values = { email: str(formData, "email") };
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientIp();
  const emailHash = subjectHash("email", parsed.data.email);
  const allowed = await withinRateLimits([
    { bucket: `reset:ip:${subjectHash("ip", ip)}`, max: 10, windowSeconds: 3600 },
    { bucket: `reset:email:${emailHash}`, max: 3, windowSeconds: 3600 },
  ]);
  const success: FormState = {
    status: "success",
    message: "If an account exists for that email, we’ve sent a link to reset your password. It can be used once.",
  };
  if (!allowed) return success; // Same response either way; nothing more is sent.

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL("/auth/confirm?next=/reset-password", site.url).toString(),
  });
  if (error) console.error("reset request error", { code: error.code });
  await recordSecurityEvent("PASSWORD_RESET_REQUESTED", null, emailHash);
  return success;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: str(formData, "password"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { status: "error", message: "Your reset link has expired. Please request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") {
      return { status: "error", fieldErrors: { password: "Choose a different, stronger password." } };
    }
    console.error("password update error", { code: error.code });
    return { status: "error", message: "We couldn’t update your password. Please request a new reset link." };
  }
  await recordSecurityEvent("PASSWORD_CHANGED", userData.user.id);
  // End every other session so a compromised session cannot persist after a reset.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/account?notice=password-changed");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
