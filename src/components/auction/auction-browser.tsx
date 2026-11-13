import Link from "next/link";
import { AuctionCard } from "@/components/auction/auction-card";
import { EmptyState } from "@/components/ui/primitives";
import { requestNow } from "@/lib/time";
import { AUCTION_VIEWS, listAuctionCategories, listAuctions, type AuctionView } from "@/modules/auction/server/queries";

const PAGE = 12;
const VIEW_LABEL: Record<AuctionView, string> = {
  all: "Live & upcoming",
  live: "Live",
  upcoming: "Upcoming",
  ending: "Ending soon",
  recent: "Recently listed",
  closed: "Closed",
};
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Filter / search / paginate real auctions with a plain GET form (works without JavaScript). */
export async function AuctionBrowser({
  searchParams,
  basePath,
  fixedCategory,
}: {
  searchParams: Promise<Params>;
  basePath: string;
  fixedCategory?: string;
}) {
  const now = await requestNow();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const viewParam = one(sp.view);
  const view: AuctionView = AUCTION_VIEWS.includes(viewParam as AuctionView) ? (viewParam as AuctionView) : "all";
  const category = fixedCategory ?? (one(sp.category) || undefined);
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const [list, categories] = await Promise.all([
    listAuctions({ view, category, search: q || undefined, limit: PAGE, offset: (page - 1) * PAGE }),
    listAuctionCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const href = (over: { view?: AuctionView; page?: number }) => {
    const p = new URLSearchParams();
    const v = over.view ?? view;
    if (v !== "all") p.set("view", v);
    if (q) p.set("q", q);
    if (!fixedCategory && category) p.set("category", category);
    const pg = over.page ?? (over.view ? 1 : page);
    if (pg > 1) p.set("page", String(pg));
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <>
      <nav aria-label="Auction views" className="flex flex-wrap gap-2">
        {(["all", "live", "ending", "upcoming", "closed"] as AuctionView[]).map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            aria-current={v === view ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm ${v === view ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>
      <form
        method="get"
        action={basePath}
        role="search"
        className="border-rule mt-4 grid gap-3 border-y py-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
      >
        {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
        <label className="flex flex-col gap-1 text-sm">
          Search by name, brand or model
          <input
            name="q"
            defaultValue={q}
            type="search"
            maxLength={100}
            className="border-rule bg-surface h-11 rounded border px-3 text-base"
          />
        </label>
        {fixedCategory ? (
          <span />
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Category
            <select
              name="category"
              defaultValue={category ?? ""}
              className="border-rule bg-surface h-11 rounded border px-3 text-base"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="bg-ink text-paper h-11 rounded px-5 font-medium">
          Apply
        </button>
      </form>

      <p className="text-ink-muted mt-6 text-sm" aria-live="polite">
        {list.total} auction{list.total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
      </p>
      {list.items.length === 0 ? (
        <EmptyState className="mt-6" title="No auctions match">
          Try another view, category or search.
        </EmptyState>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => (
            <AuctionCard key={a.id} a={a} now={now} />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} rel="prev" className="underline underline-offset-4">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} rel="next" className="underline underline-offset-4">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
