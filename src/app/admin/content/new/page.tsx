import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, qp } from "../../admin-kit";
import { DocumentForm } from "../document-form";
import { KIND_LABEL } from "../content-types";

export const metadata = { title: "New content" };

export default function NewContentPage({ searchParams }: PageProps<"/admin/content/new">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NewContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewContent({ searchParams }: Pick<PageProps<"/admin/content/new">, "searchParams">) {
  await requireStaff("/admin/content/new", "cms.content.manage");
  const kind = qp(await searchParams, "kind") === "POST" ? "POST" : "PAGE";
  return (
    <>
      <AdminCrumbs
        trail={[
          { href: "/admin", label: "Admin" },
          { href: `/admin/content?kind=${kind}`, label: KIND_LABEL[kind] },
          { label: "New" },
        ]}
      />
      <h1 className="mt-2 mb-6 text-4xl">{kind === "POST" ? "New blog post" : "New page"}</h1>
      <DocumentForm
        d={{
          id: null,
          kind,
          slug: "",
          title: "",
          summary: "",
          body: "",
          seoTitle: "",
          seoDescription: "",
          slugLocked: false,
        }}
      />
    </>
  );
}
