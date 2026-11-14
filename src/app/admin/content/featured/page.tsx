import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOpenAuctionsBySlugs } from "@/modules/auction/server/queries";
import { requireStaff } from "@/modules/core/server/auth";
import { getOpenPoolsBySlugs } from "@/modules/poolx/server/queries";
import { AdminCrumbs, Flash, qp } from "../../admin-kit";
import { addFeaturedAction, moveFeaturedAction, removeFeaturedAction } from "../actions";

export const metadata = { title: "Featured listings" };

type Featured = { id: string; module: "poolx" | "auction"; slug: string; position: number };

const MODULES = [
  { key: "poolx", label: "PoolX pools", path: "/poolx/pools/", open: "open for joining" },
  { key: "auction", label: "Auctions", path: "/auctions/", open: "live or scheduled" },
] as const;

const NOTICES: Record<string, string> = {
  "featured-added": "Listing featured on the homepage.",
  "featured-moved": "Order updated.",
  "featured-removed": "Listing no longer featured.",
};
const field = "border-rule bg-surface h-11 rounded border px-3";

export default function FeaturedAdminPage({ searchParams }: PageProps<"/admin/content/featured">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <FeaturedAdmin searchParams={searchParams} />
    </Suspense>
  );
}

async function FeaturedAdmin({ searchParams }: Pick<PageProps<"/admin/content/featured">, "searchParams">) {
  await requireStaff("/admin/content/featured", "cms.content.manage");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("cms_admin_featured_list");
  const rows = (data ?? []) as Featured[];
  const slugsOf = (m: Featured["module"]) => rows.filter((r) => r.module === m).map((r) => r.slug);
  const [pools, auctions] = await Promise.all([
    getOpenPoolsBySlugs(slugsOf("poolx")),
    getOpenAuctionsBySlugs(slugsOf("auction")),
  ]);
  const titles = new Map<string, string>([
    ...pools.map((p) => [`poolx:${p.slug}`, p.title] as const),
    ...auctions.map((a) => [`auction:${a.slug}`, a.title] as const),
  ]);

  return (
    <>
      <AdminCrumbs
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/content", label: "Content" },
          { label: "Featured" },
        ]}
      />
      <h1 className="mt-2 text-4xl">Featured listings</h1>
      <p className="text-ink-muted mt-2 max-w-3xl">
        Pick up to 6 pools and 6 auctions for the homepage “Featured” section. Only listings that are open right now are
        shown there, with their live prices and deadlines; ended or unpublished ones drop off by themselves. Changes
        apply immediately and are recorded in the audit log.
      </p>
      <Flash notice={NOTICES[qp(sp, "notice") ?? ""]} error={qp(sp, "error")} />

      <form
        action={addFeaturedAction}
        aria-label="Feature a listing"
        className="border-rule mt-6 grid gap-3 border p-5"
      >
        <h2 className="text-2xl">Feature a listing</h2>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Marketplace</span>
            <select name="module" defaultValue="poolx" className={field}>
              <option value="poolx">PoolX pool</option>
              <option value="auction">Auction</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Listing web address name (slug)</span>
            <input
              name="slug"
              required
              minLength={3}
              maxLength={90}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="e.g. used-honda-city-2019"
              aria-describedby="slug-help"
              className={field}
            />
          </label>
          <Button type="submit">Feature</Button>
        </div>
        <p id="slug-help" className="text-ink-muted text-sm">
          The last part of the listing’s address, e.g. /auctions/<strong>used-honda-city-2019</strong>.
        </p>
      </form>

      {MODULES.map((m) => {
        const list = rows.filter((r) => r.module === m.key);
        return (
          <section key={m.key} aria-labelledby={`featured-${m.key}`} className="mt-8">
            <h2 id={`featured-${m.key}`} className="text-2xl">
              {m.label} <span className="text-ink-muted text-base">({list.length} of 6)</span>
            </h2>
            {list.length === 0 ? (
              <EmptyState className="mt-4" title={`No ${m.label.toLowerCase()} featured`} />
            ) : (
              <ol className="divide-rule border-rule mt-4 divide-y border">
                {list.map((r, i) => {
                  const title = titles.get(`${m.key}:${r.slug}`);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          {title ? (
                            <Link href={`${m.path}${r.slug}`} className="underline-offset-4 hover:underline">
                              {title}
                            </Link>
                          ) : (
                            r.slug
                          )}
                        </p>
                        <p className="text-ink-muted mt-1 text-sm">
                          <span className="font-mono">{r.slug}</span>{" "}
                          {title ? (
                            <Badge tone="success">Shown — {m.open}</Badge>
                          ) : (
                            <Badge tone="warning">Not shown — not {m.open} or not found</Badge>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {i > 0 ? <MoveButton id={r.id} move="up" slug={r.slug} /> : null}
                        {i < list.length - 1 ? <MoveButton id={r.id} move="down" slug={r.slug} /> : null}
                        <form action={removeFeaturedAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <Button
                            type="submit"
                            variant="danger"
                            size="sm"
                            aria-label={`Remove from featured: ${r.slug}`}
                          >
                            Remove
                          </Button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </>
  );
}

function MoveButton({ id, move, slug }: { id: string; move: "up" | "down"; slug: string }) {
  return (
    <form action={moveFeaturedAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="move" value={move} />
      <Button type="submit" variant="secondary" size="sm" aria-label={`Move ${move}: ${slug}`}>
        {move === "up" ? "Move up" : "Move down"}
      </Button>
    </form>
  );
}
