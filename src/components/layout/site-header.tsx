import Link from "next/link";
import { mainNav, site } from "@/config/site";
import { Container } from "@/components/ui/primitives";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-rule bg-paper sticky top-0 z-40 border-b">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          {site.name}
        </Link>
        <MainNav items={mainNav} />
        <div className="flex items-center gap-1">
          {/* Account menu (My Account, My PoolX Activities, …) arrives with authentication in Phase 2. */}
          <ThemeToggle />
          <MobileNav items={mainNav} />
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
