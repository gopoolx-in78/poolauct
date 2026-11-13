import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requireAccount } from "@/modules/core/server/auth";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <h1 className="text-4xl">Profile</h1>
      <p className="text-ink-muted mt-2">Only the details we need. Your email is changed from the Security page.</p>
      <Suspense fallback={<Skeleton className="mt-8 h-72 max-w-lg" />}>
        <ProfileLoader />
      </Suspense>
    </>
  );
}

async function ProfileLoader() {
  const account = await requireAccount("/account/profile");
  return (
    <div className="mt-8 max-w-lg">
      <ProfileForm
        initial={{ displayName: account.displayName ?? "", city: account.city ?? "", state: account.state ?? "" }}
      />
    </div>
  );
}
