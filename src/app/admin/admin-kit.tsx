import Link from "next/link";
import type { ReactNode } from "react";

/** Breadcrumb line used at the top of admin pages. */
export function AdminCrumbs({ trail }: { trail: { href?: string; label: string }[] }) {
  return (
    <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
      {trail.map((t, i) => (
        <span key={t.label}>
          {i > 0 ? " / " : null}
          {t.href ? (
            <Link href={t.href} className="hover:underline">
              {t.label}
            </Link>
          ) : (
            t.label
          )}
        </span>
      ))}
    </p>
  );
}

/** Success / error banners driven by ?notice= and ?error= query parameters. */
export function Flash({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice ? (
        <p role="status" className="border-success bg-success/5 mt-4 border-l-4 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-danger bg-danger/5 mt-4 border-l-4 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-rule border p-4">
      <dt className="text-ink-muted text-xs uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-2xl">{value}</dd>
      {sub ? <dd className="text-ink-muted text-xs">{sub}</dd> : null}
    </div>
  );
}

/** Previous / next links for offset pagination; keeps the other query parameters. */
export function Pager({
  basePath,
  params,
  total,
  limit,
  offset,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  total: number;
  limit: number;
  offset: number;
}) {
  const href = (o: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (o > 0) q.set("offset", String(o));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (total <= limit)
    return (
      <p className="text-ink-muted mt-3 text-sm">
        {total} result{total === 1 ? "" : "s"}
      </p>
    );
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center gap-4 text-sm">
      {offset > 0 ? (
        <Link href={href(Math.max(0, offset - limit))} className="underline underline-offset-4">
          Previous
        </Link>
      ) : null}
      <span className="text-ink-muted">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      {offset + limit < total ? (
        <Link href={href(offset + limit)} className="underline underline-offset-4">
          Next
        </Link>
      ) : null}
    </nav>
  );
}

/** Reads a single string query parameter. */
export function qp(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export function offsetParam(sp: Record<string, string | string[] | undefined>) {
  const n = Number(qp(sp, "offset") ?? 0);
  return Number.isInteger(n) && n >= 0 && n < 1_000_000 ? n : 0;
}
