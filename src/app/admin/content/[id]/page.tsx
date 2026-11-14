import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/components/cms/markdown";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import type { Media } from "@/modules/core/media";
import { AdminCrumbs, Flash, qp } from "../../admin-kit";
import { BodyImageManager, CoverManager } from "../../media-manager";
import { documentStatusAction } from "../actions";
import { KIND_LABEL, type AdminDocument } from "../content-types";
import { DocumentForm } from "../document-form";

export const metadata = { title: "Edit content" };

const NOTICES: Record<string, string> = {
  saved: "Saved as a new revision. Publish it when it is ready.",
  publish: "Published. Visitors now see this revision.",
  unpublish: "Unpublished. It is no longer visible to visitors.",
  restore: "Earlier revision copied as the newest revision. Publish it to make it live.",
  "cover-removed": "Cover image removed.",
  "image-removed": "Image removed.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const field = "border-rule bg-surface rounded border px-3";

export default function EditContentPage({ params, searchParams }: PageProps<"/admin/content/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Edit params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Edit({ params, searchParams }: PageProps<"/admin/content/[id]">) {
  const { id } = await params;
  await requireStaff(`/admin/content/${id}`, "cms.content.manage");
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: cover }, { data: imageRows }] = await Promise.all([
    supabase.schema("api").rpc("cms_admin_get_document", { p_id: id }),
    supabase.schema("api").rpc("cms_admin_cover_get", { p_document: id }),
    supabase.schema("api").rpc("cms_admin_image_list", { p_document: id }),
  ]);
  const images = (imageRows ?? []) as Media[];
  const d = data as AdminDocument | null;
  if (!d || !d.latest) notFound();
  const path = `${d.kind === "POST" ? "/blog/" : "/info/"}${d.slug}`;
  const pending = d.status !== "PUBLISHED" || d.latestRevision > (d.publishedRevision ?? 0);

  return (
    <>
      <AdminCrumbs
        trail={[
          { href: "/admin", label: "Admin" },
          { href: `/admin/content?kind=${d.kind}`, label: KIND_LABEL[d.kind] },
          { label: d.latest.title },
        ]}
      />
      <h1 className="mt-2 text-4xl">{d.latest.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={d.status === "PUBLISHED" ? "success" : d.status === "DRAFT" ? "info" : "neutral"}>
          {d.status.toLowerCase()}
        </Badge>
        <span className="text-ink-muted">
          Revision {d.latestRevision}
          {d.publishedRevision ? ` · live revision ${d.publishedRevision}` : ""}
        </span>
        {d.status === "PUBLISHED" ? (
          <Link href={path} className="font-mono underline underline-offset-4">
            {path}
          </Link>
        ) : null}
      </p>
      <Flash notice={NOTICES[qp(sp, "notice") ?? ""]} error={qp(sp, "error")} />
      <CoverManager documentId={d.id} cover={(cover ?? null) as Media | null} />
      <BodyImageManager documentId={d.id} items={images} />

      <section aria-labelledby="publish-h" className="border-rule mt-6 grid gap-4 border p-5 md:grid-cols-2">
        <div>
          <h2 id="publish-h" className="text-2xl">
            Publishing
          </h2>
          {pending ? (
            <form action={documentStatusAction} className="mt-3">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="action" value="PUBLISH" />
              <Button type="submit">Publish revision {d.latestRevision}</Button>
            </form>
          ) : (
            <p className="text-ink-muted mt-3 text-sm">The newest revision is live.</p>
          )}
        </div>
        {d.status === "PUBLISHED" ? (
          <form action={documentStatusAction} className="grid gap-2">
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="action" value="UNPUBLISH" />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Reason for unpublishing (recorded)</span>
              <input name="reason" required minLength={10} className={`${field} h-11`} />
            </label>
            <Button type="submit" variant="danger" className="justify-self-start">
              Unpublish
            </Button>
          </form>
        ) : null}
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="edit-h">
          <h2 id="edit-h" className="mb-4 text-2xl">
            Edit
          </h2>
          <DocumentForm
            d={{
              id: d.id,
              kind: d.kind,
              slug: d.slug,
              title: d.latest.title,
              summary: d.latest.summary,
              body: d.latest.body,
              seoTitle: d.latest.seoTitle ?? "",
              seoDescription: d.latest.seoDescription ?? "",
              slugLocked: d.firstPublishedAt !== null,
            }}
          />
        </section>
        <section aria-labelledby="preview-h">
          <h2 id="preview-h" className="text-2xl">
            Preview of revision {d.latestRevision}
          </h2>
          <div className="border-rule mt-4 rounded border p-5">
            <p className="font-display text-3xl">{d.latest.title}</p>
            {d.latest.summary ? <p className="text-ink-muted mt-2">{d.latest.summary}</p> : null}
            <Markdown
              source={d.latest.body}
              images={Object.fromEntries(images.map((m) => [m.id, m]))}
              className="mt-4"
            />
          </div>
        </section>
      </div>

      <section aria-labelledby="rev-h" className="mt-10">
        <h2 id="rev-h" className="text-2xl">
          Revision history
        </h2>
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Revisions</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Revision
                </th>
                <th scope="col">Title</th>
                <th scope="col">Saved</th>
                <th scope="col">Note</th>
                <th scope="col">Restore</th>
              </tr>
            </thead>
            <tbody>
              {(d.revisions ?? []).map((r) => (
                <tr key={r.revision} className="border-rule border-t align-top">
                  <td className="py-2 font-mono">
                    {r.revision}
                    {r.revision === d.publishedRevision ? (
                      <Badge tone="success" className="ml-2">
                        live
                      </Badge>
                    ) : null}
                  </td>
                  <td>{r.title}</td>
                  <td>
                    {formatIST(r.createdAt)}
                    <div className="text-ink-muted text-xs">{r.createdBy}</div>
                  </td>
                  <td>{r.note ?? "—"}</td>
                  <td>
                    {r.revision !== d.latestRevision ? (
                      <form action={documentStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="action" value="RESTORE" />
                        <input type="hidden" name="revision" value={r.revision} />
                        <Button type="submit" variant="secondary" size="sm">
                          Restore revision {r.revision}
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
