import Link from "next/link";
import { mainNav, site } from "@/config/site";
import { Container } from "@/components/ui/primitives";
import { MainNav, MainNavLinks } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { Suspense } from "react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, UserMenuFallback } from "./user-menu";

export function SiteHeader() {
  return (
    <header className="border-rule bg-paper sticky top-0 z-40 border-b">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          {site.name}
        </Link>
        {/* usePathname() is request data on dynamic routes: highlight the active link once the URL is known. */}
        <Suspense fallback={<MainNavLinks items={mainNav} pathname={null} />}>
          <MainNav items={mainNav} />
        </Suspense>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Reads the session: streams in behind Suspense so the rest of the header stays in the static shell. */}
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenu />
          </Suspense>
          <Suspense fallback={<span aria-hidden="true" className="inline-block size-11 lg:hidden" />}>
            <MobileNav items={mainNav} />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="focus:bg-ink focus:text-paper sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:px-4 focus:py-2"
    >
      Skip to content
    </a>
  );
}
