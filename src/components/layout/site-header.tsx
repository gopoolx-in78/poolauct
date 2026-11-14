import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { site } from "@/config/site";
import { Container } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { ThemeConfig } from "@/modules/theme/schema";
import { MainNav, MainNavLinks } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, UserMenuFallback } from "./user-menu";

function Logo() {
  return (
    <Link href="/" className="font-display text-xl font-semibold tracking-tight">
      {site.name}
    </Link>
  );
}

function Nav({ items, className }: { items: ThemeConfig["nav"]; className?: string }) {
  // usePathname() is request data on dynamic routes: highlight the active link once the URL is known.
  return (
    <Suspense fallback={<MainNavLinks items={items} pathname={null} className={className} />}>
      <MainNav items={items} className={className} />
    </Suspense>
  );
}

function Actions({ items }: { items: ThemeConfig["nav"] }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {/* On small screens search is in the menu, keeping the header row within 320 px. */}
      <Link
        href="/search"
        aria-label="Search pools and auctions"
        title="Search"
        className="hover:bg-ink/5 hidden size-11 items-center justify-center rounded lg:inline-flex"
      >
        <Search aria-hidden="true" className="size-5" />
      </Link>
      <ThemeToggle />
      {/* Reads the session: streams in behind Suspense so the rest of the header stays in the static shell. */}
      <Suspense fallback={<UserMenuFallback />}>
        <UserMenu />
      </Suspense>
      <Suspense fallback={<span aria-hidden="true" className="inline-block size-11 lg:hidden" />}>
        <MobileNav items={items} />
      </Suspense>
    </div>
  );
}

/** Header layout (classic / centered / split) and stickiness come from the published theme. */
export function SiteHeader({ design }: { design: ThemeConfig }) {
  const { layout, sticky } = design.header;
  const items = design.nav;
  return (
    <header data-layout={layout} className={cn("border-rule bg-paper z-40 border-b", sticky && "sticky top-0")}>
      {layout === "centered" ? (
        <Container>
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
            <span aria-hidden="true" />
            <Logo />
            <Actions items={items} />
          </div>
          <Nav items={items} className="hidden justify-center pb-2 lg:flex" />
        </Container>
      ) : layout === "split" ? (
        <Container className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Nav items={items} />
          <Logo />
          <Actions items={items} />
        </Container>
      ) : (
        <Container className="flex h-16 items-center justify-between gap-4">
          <Logo />
          <Nav items={items} />
          <Actions items={items} />
        </Container>
      )}
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
