import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Account = {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED" | "DELETED";
  deletionRequestedAt: string | null;
  createdAt: string;
  aal: "aal0" | "aal1" | "aal2";
  isStaff: boolean;
  roles: string[];
  permissions: string[];
};

/**
 * Data Access Layer: the single place that resolves the current user. Validates the session with the auth server
 * (getUser) rather than trusting the cookie, then loads the account through the RLS-protected API.
 * Memoised per request.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  // Session checks compare token expiry with the current time and must never be prerendered, cached or included
  // in a prefetched App Shell: mark everything below as request-time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase.schema("api").rpc("get_my_account");
  if (error || !data) {
    console.error("get_my_account failed", { code: error?.code });
    return null;
  }
  return data as Account;
});

/** Redirects to sign-in when there is no session. */
export async function requireAccount(nextPath: string): Promise<Account> {
  const account = await getAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (account.status === "SUSPENDED" || account.status === "DELETED") redirect("/login?error=inactive");
  return account;
}

/**
 * Staff gate. Non-staff get a 404 (do not reveal the admin area). Staff without an MFA (aal2) session are sent to
 * MFA setup/verification. Optionally requires a specific permission (effective only at aal2).
 */
export async function requireStaff(nextPath: string, permission?: string): Promise<Account> {
  const account = await requireAccount(nextPath);
  if (!account.isStaff) notFound();
  if (account.aal !== "aal2") redirect(`/admin/mfa?next=${encodeURIComponent(nextPath)}`);
  if (permission && !account.permissions.includes(permission)) notFound();
  return account;
}
