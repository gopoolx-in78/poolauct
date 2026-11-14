import Link from "next/link";
import { site } from "@/config/site";
import { Container } from "@/components/ui/primitives";
import type { ThemeConfig } from "@/modules/theme/schema";

function LegalLine() {
  return (
    <p>
      © {site.name}. Legal policies (privacy, terms, refund &amp; cancellation) will be published after legal review.
    </p>
  );
}

/** Footer layout, tagline and link groups come from the published theme. */
export function SiteFooter({ design }: { design: ThemeConfig }) {
  const { layout, tagline } = design.footer;
  const groups = design.footerGroups;

  if (layout === "compact") {
    const links = groups.flatMap((g) => g.links);
    return (
      <footer data-layout="compact" className="border-ink bg-secondary mt-24 border-t">
        <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-8">
          <p className="font-display text-xl font-semibold">{site.name}</p>
          {links.length > 0 && (
            <nav aria-label="Footer links">
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {links.map((l) => (
                  <li key={`${l.href}|${l.label}`}>
                    <Link href={l.href} className="underline-offset-4 hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </Container>
        <div className="border-rule border-t">
          <Container className="text-ink-muted py-4 text-sm">
            <LegalLine />
          </Container>
        </div>
      </footer>
    );
  }

  return (
    <footer data-layout="columns" className="border-ink bg-secondary mt-24 border-t">
      <Container className="grid gap-10 py-12 md:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-semibold">{site.name}</p>
          {tagline && <p className="text-ink-muted mt-2 text-sm">{tagline}</p>}
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={`${g.title} links`}>
            <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">{g.title}</p>
            <ul className="mt-3 space-y-2">
              {g.links.map((l) => (
                <li key={`${l.href}|${l.label}`}>
                  <Link href={l.href} className="underline-offset-4 hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-rule border-t">
        <Container className="text-ink-muted py-6 text-sm">
          <LegalLine />
        </Container>
      </div>
    </footer>
  );
}
