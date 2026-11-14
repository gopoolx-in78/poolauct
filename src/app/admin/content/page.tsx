import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, qp } from "../admin-kit";
import { KIND_LABEL, type AdminDocument } from "./content-types";

export const metadata = { title: "Pages and posts" };

export default function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/content">, "searchParams">) {
  await requireStaff("/admin/content", "cms.content.manage");
  const sp = await searchParams;
  const kind = qp(sp, "kind") === "POST" ? "POST" : "PAGE";
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_admin_list_documents", { p_kind: kind });
  const docs = (data ?? []) as AdminDocument[];
  const base = kind === "POST" ? "/blog/" : "/info/";

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: KIND_LABEL[kind] }]} />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">{KIND_LABEL[kind]}</h1>
        <ButtonLink href={`/admin/content/new?kind=${kind}`}>
          {kind === "POST" ? "New blog post" : "New page"}
        </ButtonLink>
      </div>
      <nav aria-label="Content type" className="mt-4 flex gap-4 text-sm">
        <Link
          href="/admin/content?kind=PAGE"
          aria-current={kind === "PAGE" ? "page" : undefined}
          className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
        >
          Pages
        </Link>
        <Link
          href="/admin/content?kind=POST"
          aria-current={kind === "POST" ? "page" : undefined}
          className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
        >
          Blog posts
        </Link>
        <Link href="/admin/content/faqs" className="underline-offset-4 hover:underline">
          FAQs
        </Link>
      </nav>
      {docs.length === 0 ? (
        <EmptyState className="mt-8" title={kind === "POST" ? "No blog posts yet" : "No pages yet"} />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">{KIND_LABEL[kind]}</caption>
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Title
                </th>
                <th scope="col">Status</th>
                <th scope="col">Revisions</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-rule border-t align-top">
                  <td className="py-2">
                    <Link href={`/admin/content/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                      {d.latest?.title ?? d.slug}
                    </Link>
                    <div className="text-ink-muted font-mono text-xs">
                      {base}
                      {d.slug}
                    </div>
                  </td>
                  <td>
                    <Badge tone={d.status === "PUBLISHED" ? "success" : d.status === "DRAFT" ? "info" : "neutral"}>
                      {d.status.toLowerCase()}
                    </Badge>
                    {d.status === "PUBLISHED" && d.latestRevision > (d.publishedRevision ?? 0) ? (
                      <div className="text-warning text-xs">unpublished changes</div>
                    ) : null}
                  </td>
                  <td className="font-mono">
                    {d.latestRevision}
                    {d.publishedRevision ? ` (live: ${d.publishedRevision})` : ""}
                  </td>
                  <td>
                    {formatIST(d.updatedAt)}
                    <div className="text-ink-muted text-xs">{d.updatedBy}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
