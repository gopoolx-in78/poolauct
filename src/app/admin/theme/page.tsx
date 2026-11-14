import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, qp } from "../admin-kit";
import { discardThemeDraftAction, publishThemeAction, rollbackThemeAction } from "./actions";

export const metadata = { title: "Theme & homepage" };

const NOTICES: Record<string, string> = {
  published: "Draft published. The public site now uses this design.",
  discarded: "Draft discarded.",
  restored: "Earlier design restored and published as a new version.",
};

export type ThemeVersion = {
  id: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  label: string;
  basedOn: number | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  publishNote: string | null;
  archivedAt: string | null;
  config?: unknown;
};
export type ThemeOverview = {
  canPublish: boolean;
  canEdit: boolean;
  published: ThemeVersion | null;
  draft: ThemeVersion | null;
  versions: ThemeVersion[];
};

const field = "border-rule bg-surface rounded border px-3";

export default function ThemePage({ searchParams }: PageProps<"/admin/theme">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Theme searchParams={searchParams} />
    </Suspense>
  );
}

async function Theme({ searchParams }: Pick<PageProps<"/admin/theme">, "searchParams">) {
  const account = await requireStaff("/admin/theme");
  if (!account.permissions.some((p) => p === "cms.theme.edit" || p === "cms.theme.publish")) notFound();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_theme_overview");
  const o = data as ThemeOverview | null;
  if (!o) notFound();

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "Theme & homepage" }]} />
      <h1 className="mt-2 text-4xl">Theme &amp; homepage</h1>
      <p className="text-ink-muted mt-2 max-w-3xl">
        Colours, fonts, layout, navigation, footer, banners and homepage sections are one versioned design. Edit a
        draft, check it in the live preview, then publish. Every published version is kept and can be restored. Design
        settings never change prices, deposits, payments or permissions.
      </p>
      <Flash notice={NOTICES[qp(sp, "notice") ?? ""]} error={qp(sp, "error")} />

      <section aria-labelledby="live-h" className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="border-rule border p-5">
          <h2 id="live-h" className="text-2xl">
            Live design
          </h2>
          {o.published ? (
            <p className="mt-2 text-sm">
              Version {o.published.id} · {o.published.label}
              <br />
              <span className="text-ink-muted">
                Published {formatIST(o.published.publishedAt!)} by {o.published.publishedBy ?? "—"}
              </span>
            </p>
          ) : (
            <p className="text-ink-muted mt-2 text-sm">
              No version published yet — the site uses the shipped default design.
            </p>
          )}
        </div>
        <div className="border-rule border p-5">
          <h2 className="text-2xl">Working draft</h2>
          {o.draft ? (
            <>
              <p className="mt-2 text-sm">
                Version {o.draft.id} · {o.draft.label}
                <br />
                <span className="text-ink-muted">
                  Last saved {formatIST(o.draft.updatedAt)} by {o.draft.updatedBy ?? "—"}
                </span>
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {o.canEdit && <ButtonLink href="/admin/theme/editor">Continue editing</ButtonLink>}
              </div>
              {o.canPublish && (
                <form action={publishThemeAction} className="mt-6 grid gap-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">What changed (recorded)</span>
                    <input name="note" required minLength={10} className={`${field} h-11`} />
                  </label>
                  <Button type="submit" className="justify-self-start">
                    Publish draft
                  </Button>
                </form>
              )}
              {o.canEdit && (
                <form action={discardThemeDraftAction} className="mt-6 grid gap-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Reason for discarding (recorded)</span>
                    <input name="reason" required minLength={10} className={`${field} h-11`} />
                  </label>
                  <Button type="submit" variant="danger" className="justify-self-start">
                    Discard draft
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="text-ink-muted mt-2 text-sm">No draft. Starting one copies the live design.</p>
              {o.canEdit && (
                <ButtonLink href="/admin/theme/editor" className="mt-4">
                  Start a draft
                </ButtonLink>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="versions-h" className="mt-10">
        <h2 id="versions-h" className="text-2xl">
          Version history
        </h2>
        {o.versions.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No versions yet.</p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">Theme versions</caption>
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th scope="col" className="py-2">
                    Version
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Published</th>
                  <th scope="col">Note</th>
                  <th scope="col">Restore</th>
                </tr>
              </thead>
              <tbody>
                {o.versions.map((v) => (
                  <tr key={v.id} className="border-rule border-t align-top">
                    <td className="py-2">
                      <span className="font-mono">{v.id}</span> · {v.label}
                      {v.basedOn ? <div className="text-ink-muted text-xs">based on {v.basedOn}</div> : null}
                    </td>
                    <td>
                      <Badge tone={v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "info" : "neutral"}>
                        {v.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td>
                      {v.publishedAt ? (
                        <>
                          {formatIST(v.publishedAt)}
                          <div className="text-ink-muted text-xs">{v.publishedBy}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs">{v.publishNote ?? "—"}</td>
                    <td>
                      {o.canPublish && v.status === "ARCHIVED" && v.publishedAt ? (
                        <form action={rollbackThemeAction} className="flex flex-wrap items-end gap-2 py-1">
                          <input type="hidden" name="version" value={v.id} />
                          <label className="grid gap-1 text-xs">
                            <span>Reason (recorded)</span>
                            <input name="reason" required minLength={10} className={`${field} h-9 w-48`} />
                          </label>
                          <Button type="submit" variant="secondary" size="sm">
                            Restore version {v.id}
                          </Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-ink-muted mt-8 text-sm">
        Published and restored designs are recorded in the{" "}
        <Link href="/admin/audit?action=cms.theme" className="underline underline-offset-4">
          audit log
        </Link>
        .
      </p>
    </>
  );
}
