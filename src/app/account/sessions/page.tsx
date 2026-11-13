import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { revokeSessionAction, signOutOtherSessionsAction } from "../actions";

export const metadata = { title: "Sessions" };

type Session = {
  id: string;
  created_at: string;
  last_active_at: string | null;
  user_agent: string | null;
  ip_hint: string | null;
  aal: string | null;
  is_current: boolean;
};

const notices: Record<string, { tone: "success" | "danger"; text: string }> = {
  revoked: { tone: "success", text: "That session was signed out." },
  "others-signed-out": { tone: "success", text: "All other sessions were signed out." },
  failed: { tone: "danger", text: "We couldn’t complete that. Please try again." },
  invalid: { tone: "danger", text: "That session could not be found." },
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "—";

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function SessionsPage({ searchParams }: PageProps<"/account/sessions">) {
  return (
    <>
      <h1 className="text-4xl">Sessions</h1>
      <p className="text-ink-muted mt-2">Devices currently signed in to your account. Times are shown in IST.</p>
      <Suspense fallback={<Skeleton className="mt-8 h-64" />}>
        <Sessions searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Sessions({ searchParams }: { searchParams: PageProps<"/account/sessions">["searchParams"] }) {
  await requireAccount("/account/sessions");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("list_my_sessions");
  const sessions = (data ?? []) as Session[];
  const noticeKey = (await searchParams).notice;
  const notice = typeof noticeKey === "string" ? notices[noticeKey] : undefined;

  return (
    <div className="mt-8 space-y-6">
      {notice ? (
        <p
          role={notice.tone === "danger" ? "alert" : "status"}
          className={`border-l-4 px-4 py-3 text-sm ${notice.tone === "danger" ? "border-danger bg-danger/5" : "border-success bg-success/5"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm">
          We couldn&rsquo;t load your sessions. Please refresh the page.
        </p>
      ) : (
        <ul className="divide-rule border-rule divide-y border-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {describeAgent(s.user_agent)}
                  {s.is_current ? <Badge tone="success">This device</Badge> : null}
                  {s.aal === "aal2" ? <Badge tone="info">MFA</Badge> : null}
                </p>
                <p className="text-ink-muted mt-1 text-sm">
                  Signed in {fmt(s.created_at)} · Last active {fmt(s.last_active_at)}
                  {s.ip_hint ? ` · Network ${s.ip_hint}` : ""}
                </p>
              </div>
              {!s.is_current ? (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Sign out
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {sessions.filter((s) => !s.is_current).length > 0 ? (
        <form action={signOutOtherSessionsAction}>
          <Button type="submit" variant="danger" size="sm">
            Sign out of all other sessions
          </Button>
        </form>
      ) : null}
    </div>
  );
}
