import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { TotpChallenge, TotpEnrollment } from "@/components/auth/totp";
import { Skeleton } from "@/components/ui/primitives";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";

export const metadata = { title: "Verify it’s you" };

export default function AdminMfaPage({ searchParams }: PageProps<"/admin/mfa">) {
  return (
    <div className="max-w-lg">
      <h1 className="text-4xl">Verify it&rsquo;s you</h1>
      <p className="text-ink-muted mt-2">Staff areas require an authenticator app on every session.</p>
      <Suspense fallback={<Skeleton className="mt-8 h-64" />}>
        <Mfa searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Mfa({ searchParams }: { searchParams: PageProps<"/admin/mfa">["searchParams"] }) {
  const account = await requireAccount("/admin/mfa");
  if (!account.isStaff) notFound();
  const next = safeNextPath((await searchParams).next, "/admin");
  if (account.aal === "aal2") redirect(next);

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).find((f) => f.status === "verified");

  return (
    <div className="mt-8">
      {verified ? (
        <TotpChallenge factorId={verified.id} next={next} />
      ) : (
        <>
          <p className="mb-6 text-sm">
            Set up an authenticator app to continue. You&rsquo;ll need it each time you sign in to the admin area.
          </p>
          <TotpEnrollment next={next} />
        </>
      )}
    </div>
  );
}
