"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { NavItem } from "@/config/site";
import { cn } from "@/lib/cn";

/** Mobile navigation drawer built on the native <dialog> (focus trap + Esc handled by the browser). */
export function MobileNav({ items }: { items: NavItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close when the route changes.
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="hover:bg-ink/5 inline-flex size-11 items-center justify-center rounded lg:hidden"
        aria-haspopup="dialog"
        aria-controls="mobile-nav"
        onClick={() => ref.current?.showModal()}
      >
        <Menu aria-hidden="true" className="size-6" />
        <span className="sr-only">Open menu</span>
      </button>
      <dialog
        id="mobile-nav"
        ref={ref}
        aria-label="Site menu"
        className="bg-paper text-ink backdrop:bg-ink/40 mr-0 ml-auto h-dvh max-h-dvh w-[min(22rem,100vw)] max-w-full p-0"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="border-rule flex items-center justify-between border-b px-4 py-3">
          <span className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">Menu</span>
          <button
            type="button"
            className="hover:bg-ink/5 inline-flex size-11 items-center justify-center rounded"
            onClick={() => ref.current?.close()}
          >
            <X aria-hidden="true" className="size-6" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <nav aria-label="Main">
          <ul className="flex flex-col py-2">
            {items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={`${item.href}|${item.label}`}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "font-display hover:bg-ink/5 block px-4 py-3 text-2xl",
                      active && "underline decoration-2 underline-offset-8",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </dialog>
    </>
  );
}
