import Link from "next/link";
import { Suspense } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { requireAccount } from "@/modules/core/server/auth";
import { cancelDeletionAction } from "./actions";

export const metadata = { title: "Overview" };

const notices: Record<string, string> = {
  "email-confirmed": "Your email address is confirmed. Welcome!",
  "password-changed": "Your password was changed and your other sessions were signed out.",
  "deletion-requested": "We’ve received your account deletion request.",
  "deletion-cancelled": "Your account deletion request was cancelled.",
};

export default function AccountOverviewPage({ searchParams }: PageProps<"/account">) {
  return (
    <>
      <h1 className="text-4xl">My account</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-48" />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const account = await requireAccount("/account");
  const notice = (await searchParams).notice;
  const message = typeof notice === "string" ? notices[notice] : undefined;

  return (
    <div className="mt-8 space-y-10">
      {message ? (
        <p role="status" className="border-success bg-success/5 border-l-4 px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      {account.status === "DELETION_REQUESTED" ? (
        <section className="border-warning bg-warning/5 border-l-4 px-4 py-4">
          <h2 className="font-sans text-base font-semibold">Deletion requested</h2>
          <p className="mt-1 text-sm">
            Your request is waiting for review. Records we must keep by law (for example payment records) are retained
            even after deletion.
          </p>
          <form action={cancelDeletionAction} className="mt-3">
            <Button type="submit" variant="secondary" size="sm">
              Cancel deletion request
            </Button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="details-title">
        <h2 id="details-title" className="text-2xl">
          Your details
        </h2>
        <dl className="divide-rule border-rule mt-4 divide-y border-y">
          {[
            ["Name", account.displayName ?? "Not set"],
            ["Email", account.email],
            ["Location", [account.city, account.state].filter(Boolean).join(", ") || "Not set"],
            [
              "Member since",
              new Date(account.createdAt).toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }),
            ],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
              <dt className="text-ink-muted w-40 shrink-0 text-sm">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <ButtonLink href="/account/profile" variant="secondary" size="sm" className="mt-4">
          Edit profile
        </ButtonLink>
      </section>

      <section aria-labelledby="roles-title">
        <h2 id="roles-title" className="text-2xl">
          Access
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {account.roles.map((r) => (
            <li key={r}>
              <Badge>{r.replaceAll("_", " ")}</Badge>
            </li>
          ))}
        </ul>
        {account.isStaff ? (
          <p className="mt-4 text-sm">
            You have staff access.{" "}
            <Link href="/admin" className="underline underline-offset-4">
              Open the admin area
            </Link>{" "}
            (requires an authenticator app).
          </p>
        ) : null}
      </section>

      <section aria-labelledby="coming-title">
        <h2 id="coming-title" className="text-2xl">
          Activity
        </h2>
        <p className="text-ink-muted mt-2">
          Your PoolX pools, auction participation, orders, deposits and refunds will appear here as those marketplaces
          open.
        </p>
      </section>
    </div>
  );
}
