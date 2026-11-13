"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Account sections that exist today. PoolX activities, auction activities, orders, transactions, deposits, refunds,
 * notifications and support are added here as their phases ship (no dead links).
 */
export const accountLinks = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/sessions", label: "Sessions" },
  { href: "/account/delete", label: "Delete account" },
] as const;

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {accountLinks.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hover:bg-ink/5 block rounded px-3 py-2 text-sm",
                  active ? "bg-ink/5 font-medium" : "text-ink-muted",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
