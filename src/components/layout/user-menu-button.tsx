"use client";

import { CircleUser } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * User menu (master prompt §4). Lists only sections that exist today; PoolX/Auction activities, orders,
 * transactions, deposits, refunds, notifications and support are added as their phases ship.
 */
const items = [
  { href: "/account", label: "My Account" },
  { href: "/account/poolx", label: "My PoolX activities" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/sessions", label: "Sessions" },
];

export function UserMenuButton({ name, isStaff }: { name: string; isStaff: boolean }) {
  // Open state is tied to the path it was opened on, so navigating closes the menu without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = openAt === pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpenAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="hover:bg-ink/5 inline-flex h-11 max-w-[12rem] items-center gap-2 rounded px-3 text-sm font-medium"
      >
        <CircleUser aria-hidden="true" className="size-5 shrink-0" />
        <span className="hidden truncate sm:inline">{name}</span>
        <span className="sr-only sm:hidden">Account menu</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="bg-surface border-rule absolute right-0 z-50 mt-1 w-56 border py-1 shadow-[var(--shadow-overlay)]"
        >
          <nav aria-label="Account menu">
            <ul>
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="hover:bg-ink/5 block px-4 py-2 text-sm">
                    {i.label}
                  </Link>
                </li>
              ))}
              {isStaff ? (
                <li>
                  <Link href="/admin" className="hover:bg-ink/5 block px-4 py-2 text-sm">
                    Admin
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
          <form action={signOutAction} className="border-rule border-t">
            <button type="submit" className="hover:bg-ink/5 block w-full px-4 py-2 text-left text-sm">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
