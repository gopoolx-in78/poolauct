import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/primitives";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <Container className="py-24 md:py-32">
      <p className="text-ink-muted font-mono text-sm tracking-[0.2em] uppercase">Error 404</p>
      <h1 className="mt-4 max-w-3xl text-5xl md:text-7xl">This page doesn&rsquo;t exist.</h1>
      <p className="text-ink-muted mt-6 max-w-xl text-lg">
        The link may be broken, or the pool or auction may have been removed.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/">Go to the homepage</ButtonLink>
        <ButtonLink href="/poolx" variant="secondary">
          Browse PoolX
        </ButtonLink>
        <ButtonLink href="/auctions" variant="secondary">
          Browse Auctions
        </ButtonLink>
      </div>
    </Container>
  );
}
