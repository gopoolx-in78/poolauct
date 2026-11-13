import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "email_change"]);

/**
 * Email link handler (confirmation, recovery, email change). Verifies the one-time token hash server-side, which
 * works across devices (unlike PKCE code exchange). Tokens are single-use and expire (auth.email.otp_expiry).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/account?notice=email-confirmed";
  const next = safeNextPath(searchParams.get("next"), fallback);

  const fail = () => NextResponse.redirect(new URL("/login?error=link", request.url));

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type) || tokenHash.length > 512) return fail();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  return NextResponse.redirect(new URL(next, request.url));
}
