import Link from "next/link";
import { connection } from "next/server";
import { PoolCard } from "@/components/poolx/pool-card";
import { EmptyState } from "@/components/ui/primitives";
import { requestNow } from "@/lib/time";
import { listCategories, listPools, POOL_SORTS, type PoolSort } from "@/modules/poolx/server/queries";

const PAGE_SIZE = 12;
const SORT_LABEL: Record<PoolSort, string> = { ending: "Ending soon", popular: "Most joined", newest: "Newest" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Search / filter / sort / paginate over real pools. Plain GET form: works without JavaScript. */
export async function PoolBrowser({
  searchParams,
  basePath,
  fixedCategory,
}: {
  searchParams: Promise<Params>;
  basePath: string;
  fixedCategory?: string;
}) {
  await connection();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const category = fixedCategory ?? (one(sp.category) || undefined);
  const sortParam = one(sp.sort);
  const sort: PoolSort = POOL_SORTS.includes(sortParam as PoolSort) ? (sortParam as PoolSort) : "ending";
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));

  const [list, categories] = await Promise.all([
    listPools({ search: q || undefined, category, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const now = await requestNow();
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!fixedCategory && category) params.set("category", category);
    if (sort !== "ending") params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <>
      <form
        method="get"
        action={basePath}
        role="search"
        className="border-rule grid gap-3 border-y py-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      >
        <label className="flex flex-col gap-1 text-sm">
          Search pools
          <input
            name="q"
            defaultValue={q}
            type="search"
            maxLength={100}
            placeholder="e.g. laptop, cement"
            className="border-rule bg-surface h-11 rounded border px-3 text-base"
          />
        </label>
        {fixedCategory ? null : (
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
        <label className="flex flex-col gap-1 text-sm">
          Sort by
          <select name="sort" defaultValue={sort} className="border-rule bg-surface h-11 rounded border px-3 text-base">
            {POOL_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="bg-ink text-paper h-11 rounded px-5 font-medium">
          Apply
        </button>
      </form>

      <p className="text-ink-muted mt-6 text-sm" aria-live="polite">
        {list.total} pool{list.total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {list.items.length === 0 ? (
        <EmptyState className="mt-6" title={q || category ? "No pools match" : "No pools are open yet"}>
          {q || category
            ? "Try a different search or category."
            : "Published pools will appear here with live member counts."}{" "}
          Can&rsquo;t find what you need?{" "}
          <Link href="/poolx/request" className="text-ink underline underline-offset-4">
            Request a pool
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {list.items.map((p) => (
            <PoolCard key={p.id} pool={p} now={now} />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className="underline underline-offset-4">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className="underline underline-offset-4">
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
