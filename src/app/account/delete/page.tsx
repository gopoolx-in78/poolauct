import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requireAccount } from "@/modules/core/server/auth";
import { DeleteForm } from "./delete-form";

export const metadata = { title: "Delete account" };

export default function DeleteAccountPage() {
  return (
    <>
      <h1 className="text-4xl">Delete account</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-64 max-w-lg" />}>
        <DeleteSection />
      </Suspense>
    </>
  );
}

async function DeleteSection() {
  const account = await requireAccount("/account/delete");
  if (account.status === "DELETION_REQUESTED") {
    return (
      <p className="mt-6 max-w-lg">
        You&rsquo;ve already requested deletion. You can cancel it from your account overview.
      </p>
    );
  }
  return (
    <div className="mt-6 max-w-lg space-y-4">
      <p>Requesting deletion starts a review. We&rsquo;ll then remove or anonymise your personal data.</p>
      <ul className="text-ink-muted list-disc space-y-1 pl-5 text-sm">
        <li>
          Records we must keep by law — such as payments, refunds and invoices — are retained for the required period.
        </li>
        <li>
          Requests can&rsquo;t complete while you have an open pool contribution, auction deposit or unpaid invoice.
        </li>
        <li>You can cancel the request until it has been processed.</li>
      </ul>
      <DeleteForm />
    </div>
  );
}
