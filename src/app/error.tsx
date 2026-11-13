"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/primitives";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Error monitoring (Sentry) is wired in a later phase. Never render error details to visitors.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-24 md:py-32">
      <p className="text-ink-muted font-mono text-sm tracking-[0.2em] uppercase">Something went wrong</p>
      <h1 className="mt-4 max-w-3xl text-5xl md:text-6xl">We couldn&rsquo;t load this page.</h1>
      <p className="text-ink-muted mt-6 max-w-xl text-lg">
        Please try again. If you were making a payment or placing a bid, check its status in your account before
        retrying — nothing is charged twice.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to the homepage
        </ButtonLink>
      </div>
    </Container>
  );
}
