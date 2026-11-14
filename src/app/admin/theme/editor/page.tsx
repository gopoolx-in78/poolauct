import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { DEFAULT_THEME, parseThemeConfig } from "@/modules/theme/schema";
import { AdminCrumbs } from "../../admin-kit";
import type { ThemeOverview } from "../page";
import { ThemeEditor } from "./theme-editor";

export const metadata = { title: "Edit design" };

export default function ThemeEditorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem]" />}>
      <Editor />
    </Suspense>
  );
}

async function Editor() {
  await requireStaff("/admin/theme/editor", "cms.theme.edit");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_theme_overview");
  const o = data as ThemeOverview | null;
  if (!o) notFound();
  const source = o.draft ?? o.published;
  const initial = source?.config ? parseThemeConfig(source.config) : DEFAULT_THEME;
  const label = o.draft?.label ?? `Changes to version ${o.published?.id ?? "default"}`;

  return (
    <>
      <AdminCrumbs
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/theme", label: "Theme & homepage" },
          { label: "Edit design" },
        ]}
      />
      <h1 className="mt-2 text-4xl">Edit design</h1>
      <p className="text-ink-muted mt-2 max-w-3xl">
        {o.draft
          ? `Editing draft version ${o.draft.id}.`
          : o.published
            ? `Starting a new draft from live version ${o.published.id}.`
            : "Starting a new draft from the shipped default design."}{" "}
        Saving never changes the public site; publishing does.
      </p>
      <ThemeEditor initial={initial} initialLabel={label} siteName={site.name} canPublish={o.canPublish} />
    </>
  );
}
