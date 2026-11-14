"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/config/site";
import { cn } from "@/lib/cn";

/** Pure link list; `pathname` is null while the current URL is not yet known (prerendered shell). */
export function MainNavLinks({
  items,
  pathname,
  className,
}: {
  items: NavItem[];
  pathname: string | null;
  className?: string;
}) {
  return (
    <nav aria-label="Main" className={className ?? "hidden lg:block"}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = pathname !== null && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
          return (
            <li key={`${item.href}|${item.label}`}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-ink-muted hover:text-ink inline-flex h-11 items-center px-3 text-sm font-medium",
                  active && "text-ink underline decoration-2 underline-offset-[10px]",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MainNav({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  return <MainNavLinks items={items} pathname={pathname} className={className} />;
}
