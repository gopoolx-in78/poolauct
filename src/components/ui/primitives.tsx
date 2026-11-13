import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[80rem] px-4 md:px-6 lg:px-8", className)} {...props} />;
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-rule text-ink-muted",
  accent: "border-accent text-accent",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
  info: "border-info text-info",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs tracking-wide uppercase",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Accessible progress bar. `value`/`max` must come from real data. */
export function Progress({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const safeMax = Math.max(max, 1);
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = (clamped / safeMax) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      className={cn("bg-rule h-2 w-full overflow-hidden rounded", className)}
    >
      <div
        className="bg-accent ease-standard h-full transition-[width] duration-[var(--duration-reveal)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("bg-rule/60 animate-pulse rounded", className)} />;
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-rule border border-dashed px-6 py-10 text-center", className)}>
      <p className="font-display text-xl">{title}</p>
      {children ? <div className="text-ink-muted mx-auto mt-2 max-w-prose">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? <p className="text-accent font-mono text-xs tracking-[0.2em] uppercase">{eyebrow}</p> : null}
      <h2 id={id} className="mt-2 text-3xl md:text-4xl">
        {title}
      </h2>
      {children ? <div className="text-ink-muted mt-3 text-lg">{children}</div> : null}
    </div>
  );
}

export type Crumb = { href: string; label: string };

/** Visible breadcrumbs + matching BreadcrumbList JSON-LD. Last crumb is the current page. */
export function Breadcrumbs({ items, siteUrl }: { items: Crumb[]; siteUrl: string }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: new URL(c.href, siteUrl).toString(),
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-ink">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="underline-offset-4 hover:underline">
                    {c.label}
                  </Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <JsonLd data={jsonLd} />
    </nav>
  );
}

/** Serialises structured data safely (escapes `<` so content cannot close the script tag). */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
