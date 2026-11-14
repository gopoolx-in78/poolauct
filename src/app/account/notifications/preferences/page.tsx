import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/form-kit";
import { Skeleton } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { channelStatus } from "@/modules/notifications/server/channels";
import { savePreferencesAction } from "../actions";
import type { PreferenceRow } from "../types";

export const metadata = { title: "Notification settings" };

export default function NotificationPreferencesPage({ searchParams }: PageProps<"/account/notifications/preferences">) {
  return (
    <>
      <p className="text-sm">
        <Link href="/account/notifications" className="underline underline-offset-4">
          Notifications
        </Link>
      </p>
      <h1 className="mt-2 text-4xl">Notification settings</h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        Choose how we tell you about each update. Payment, deposit and refund notices are always sent in the app and by
        e-mail.
      </p>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <PreferencesForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PreferencesForm({
  searchParams,
}: {
  searchParams: PageProps<"/account/notifications/preferences">["searchParams"];
}) {
  await requireAccount("/account/notifications/preferences");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("notifications_preferences");
  if (error || !Array.isArray(data)) {
    return (
      <p role="alert" className="border-danger bg-danger/5 mt-8 border-l-4 px-4 py-3 text-sm">
        We couldn&rsquo;t load your settings. Please refresh.
      </p>
    );
  }
  const rows = data as PreferenceRow[];
  const channels = channelStatus();
  const groups = [
    { domain: "poolx", title: "PoolX" },
    { domain: "auction", title: "Auctions" },
  ] as const;

  return (
    <div className="mt-8">
      {sp.notice === "saved" ? (
        <p role="status" className="border-success bg-success/5 mb-6 border-l-4 px-4 py-3 text-sm">
          Settings saved.
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="border-danger bg-danger/5 mb-6 border-l-4 px-4 py-3 text-sm">
          We couldn&rsquo;t save your settings. Please try again.
        </p>
      ) : null}
      {!channels.EMAIL.available ? (
        <p className="border-rule bg-secondary mb-6 border-l-4 px-4 py-3 text-sm">
          E-mail sending is not set up on this site yet. Your choices are saved and apply once it is.
        </p>
      ) : null}

      <form action={savePreferencesAction} className="space-y-10">
        {groups.map((g) => (
          <fieldset key={g.domain} className="min-w-0">
            <legend className="font-display text-2xl">{g.title}</legend>
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[18rem] text-left text-sm">
                <thead className="text-ink-muted">
                  <tr className="border-rule border-b">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Update
                    </th>
                    <th scope="col" className="w-16 py-2 pr-2 font-medium sm:w-20 sm:pr-4">
                      In app
                    </th>
                    <th scope="col" className="w-16 py-2 pr-2 font-medium sm:w-20 sm:pr-4">
                      E-mail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.domain === g.domain)
                    .map((r) => (
                      <tr key={r.event} className="border-rule border-b align-top">
                        <th scope="row" className="py-3 pr-4 font-normal">
                          <span className="font-medium">{r.label}</span>
                          {r.essential ? <span className="text-ink-muted"> · always on</span> : null}
                          <span className="text-ink-muted block">{r.description}</span>
                        </th>
                        <td className="py-3 pr-2 sm:pr-4">
                          <input
                            type="checkbox"
                            name={`inApp:${r.event}`}
                            defaultChecked={r.inApp}
                            disabled={r.essential}
                            aria-label={`${r.label}: in app`}
                            className="size-5"
                          />
                        </td>
                        <td className="py-3 pr-2 sm:pr-4">
                          <input
                            type="checkbox"
                            name={`email:${r.event}`}
                            defaultChecked={r.email}
                            disabled={r.essential}
                            aria-label={`${r.label}: e-mail`}
                            className="size-5"
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </fieldset>
        ))}
        <p className="text-ink-muted text-sm">
          SMS and WhatsApp are not available yet; they will appear here once an approved provider is set up.
        </p>
        <SubmitButton>Save settings</SubmitButton>
      </form>
    </div>
  );
}
