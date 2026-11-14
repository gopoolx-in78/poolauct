import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { AdminCrumbs, Flash, qp } from "../../admin-kit";
import { saveFaqAction } from "../actions";

export const metadata = { title: "FAQs" };

type AdminFaq = {
  id: string;
  topic: "general" | "poolx" | "auction";
  question: string;
  answer: string;
  sort: number;
  status: "PUBLISHED" | "HIDDEN";
};

const TOPICS = [
  ["general", "General"],
  ["poolx", "PoolX"],
  ["auction", "Auctions"],
] as const;
const field = "border-rule bg-surface rounded border px-3";

export default function FaqAdminPage({ searchParams }: PageProps<"/admin/content/faqs">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Faqs searchParams={searchParams} />
    </Suspense>
  );
}

function FaqForm({ f, idx }: { f: AdminFaq | null; idx: string }) {
  return (
    <form action={saveFaqAction} className="grid gap-3">
      <input type="hidden" name="id" value={f?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Topic</span>
          <select name="topic" defaultValue={f?.topic ?? "general"} className={`${field} h-11`}>
            {TOPICS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Order</span>
          <input
            name="sort"
            type="number"
            min={0}
            max={1000}
            defaultValue={f?.sort ?? 100}
            className={`${field} h-11`}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Visibility</span>
          <select name="status" defaultValue={f?.status ?? "HIDDEN"} className={`${field} h-11`}>
            <option value="HIDDEN">Hidden</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Question {idx}</span>
        <input
          name="question"
          required
          minLength={5}
          maxLength={200}
          defaultValue={f?.question}
          className={`${field} h-11`}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Answer {idx} (plain text)</span>
        <textarea
          name="answer"
          required
          minLength={5}
          maxLength={2000}
          rows={4}
          defaultValue={f?.answer}
          className="border-rule bg-surface rounded border px-3 py-2"
        />
      </label>
      <Button type="submit" variant={f ? "secondary" : "primary"} className="justify-self-start">
        {f ? `Save question ${idx}` : "Add question"}
      </Button>
    </form>
  );
}

async function Faqs({ searchParams }: Pick<PageProps<"/admin/content/faqs">, "searchParams">) {
  await requireStaff("/admin/content/faqs", "cms.content.manage");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_admin_list_faqs");
  const faqs = (data ?? []) as AdminFaq[];

  return (
    <>
      <AdminCrumbs trail={[{ href: "/admin", label: "Admin" }, { label: "FAQs" }]} />
      <h1 className="mt-2 text-4xl">FAQs</h1>
      <p className="text-ink-muted mt-2 max-w-3xl">
        Published questions appear on /faq (and on the homepage if the FAQ section is enabled). Every change is kept in
        the audit log with the previous wording. Answers must match the published rules — never promise fees, deposits
        or refund times that are not configured.
      </p>
      <Flash notice={qp(sp, "notice") === "faq-saved" ? "Saved." : undefined} error={qp(sp, "error")} />

      <section aria-labelledby="new-faq" className="border-rule mt-6 border p-5">
        <h2 id="new-faq" className="mb-4 text-2xl">
          New question
        </h2>
        <FaqForm f={null} idx="" />
      </section>

      <section aria-labelledby="faq-list" className="mt-10">
        <h2 id="faq-list" className="text-2xl">
          All questions ({faqs.length})
        </h2>
        <ol className="mt-4 grid gap-6">
          {faqs.map((f, i) => (
            <li key={f.id} className="border-rule border-t pt-4">
              <p className="mb-3 flex items-center gap-2 text-sm">
                <Badge tone={f.status === "PUBLISHED" ? "success" : "neutral"}>{f.status.toLowerCase()}</Badge>
                <span className="text-ink-muted">{TOPICS.find(([v]) => v === f.topic)?.[1]}</span>
              </p>
              <FaqForm f={f} idx={String(i + 1)} />
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
