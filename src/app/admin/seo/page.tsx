import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { formatIST } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SEO_ROUTES, type SeoRoute } from "@/modules/cms/server/queries";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, qp } from "../admin-kit";
import { saveSeoAction } from "./actions";

export const metadata = { title: "SEO" };

const ROUTE_LABEL: Record<SeoRoute, string> = {
  home: "Homepage (/)",
  poolx: "PoolX (/poolx)",
  auctions: "Auctions (/auctions)",
  "how-it-works": "How it works (/how-it-works)",
  about: "About us (/about)",
  contact: "Contact us (/contact)",
  faq: "FAQ (/faq)",
  blog: "Blog (/blog)",
};

type Entry = { title: string | null; description: string | null; updatedAt: string; updatedBy: string | null };
const field = "border-rule bg-surface rounded border px-3";

export default function SeoPage({ searchParams }: PageProps<"/admin/seo">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Seo searchParams={searchParams} />
    </Suspense>
  );
}

async function Seo({ searchParams }: Pick<PageProps<"/admin/seo">, "searchParams">) {
  await requireStaff("/admin/seo", "seo.manage");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_admin_list_seo");
  const entries = (data ?? {}) as Partial<Record<SeoRoute, Entry>>;

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "SEO" }]} />
      <h1 className="mt-2 text-4xl">SEO</h1>
      <p className="text-ink-muted mt-2 max-w-3xl">
        Override the search title (10–70 characters) and description (50–160 characters) of the main pages. Leave a
        field empty to use the built-in text. Pages and blog posts have their own settings in their editor. Changes are
        audited.
      </p>
      <Flash notice={qp(sp, "notice") === "saved" ? "Saved." : undefined} error={qp(sp, "error")} />
      <div className="mt-6 grid gap-6">
        {SEO_ROUTES.map((r) => {
          const e = entries[r];
          return (
            <form key={r} action={saveSeoAction} className="border-rule grid gap-3 border p-5">
              <input type="hidden" name="route" value={r} />
              <h2 className="text-xl">{ROUTE_LABEL[r]}</h2>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Search title for {ROUTE_LABEL[r]}</span>
                <input name="title" maxLength={70} defaultValue={e?.title ?? ""} className={`${field} h-11`} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Search description for {ROUTE_LABEL[r]}</span>
                <textarea
                  name="description"
                  maxLength={160}
                  rows={2}
                  defaultValue={e?.description ?? ""}
                  className="border-rule bg-surface rounded border px-3 py-2"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="secondary" size="sm">
                  Save {ROUTE_LABEL[r]}
                </Button>
                {e ? (
                  <span className="text-ink-muted text-xs">
                    Last changed {formatIST(e.updatedAt)} by {e.updatedBy ?? "—"}
                  </span>
                ) : null}
              </div>
            </form>
          );
        })}
      </div>
    </>
  );
}
