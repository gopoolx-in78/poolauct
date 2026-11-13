import Link from "next/link";
import { Suspense } from "react";
import { TotpChallenge, TotpEnrollment } from "@/components/auth/totp";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { EmailChangeForm } from "./email-form";

export const metadata = { title: "Security" };

const notices: Record<string, string> = {
  "mfa-verified": "Authenticator app verified for this session.",
};

export default function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  return (
    <>
      <h1 className="text-4xl">Security</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <Security searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Security({ searchParams }: { searchParams: PageProps<"/account/security">["searchParams"] }) {
  const account = await requireAccount("/account/security");
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
  const notice = (await searchParams).notice;
  const message = typeof notice === "string" ? notices[notice] : undefined;

  return (
    <div className="mt-8 space-y-12">
      {message ? (
        <p role="status" className="border-success bg-success/5 border-l-4 px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      <section aria-labelledby="mfa-title" className="max-w-lg">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="mfa-title" className="text-2xl">
            Authenticator app
          </h2>
          {verified ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
        </div>
        <p className="text-ink-muted mt-2 text-sm">
          Adds a second step when you sign in to sensitive areas.{" "}
          {account.isStaff ? <strong className="text-ink">Required for staff accounts.</strong> : "Recommended."}
        </p>
        <div className="mt-6">
          {!verified ? (
            <TotpEnrollment />
          ) : account.aal !== "aal2" ? (
            <>
              <p className="mb-4 text-sm">Verify a code to unlock sensitive actions in this session.</p>
              <TotpChallenge factorId={verified.id} />
            </>
          ) : (
            <p className="text-sm">This session is verified with your authenticator app.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="password-title" className="max-w-lg">
        <h2 id="password-title" className="text-2xl">
          Password
        </h2>
        <p className="text-ink-muted mt-2 text-sm">
          To change your password, we&rsquo;ll email you a one-time link. Changing it signs you out everywhere else.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block underline underline-offset-4">
          Send me a password reset link
        </Link>
      </section>

      <section aria-labelledby="email-title" className="max-w-lg">
        <h2 id="email-title" className="text-2xl">
          Email address
        </h2>
        <p className="text-ink-muted mt-2 text-sm">
          Current: <span className="text-ink">{account.email}</span>. We&rsquo;ll ask you to confirm the change from
          both your current and new addresses.
        </p>
        <div className="mt-4">
          <EmailChangeForm />
        </div>
      </section>
    </div>
  );
}
