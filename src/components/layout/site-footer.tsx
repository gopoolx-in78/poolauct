import Link from "next/link";
import { site } from "@/config/site";
import { Container } from "@/components/ui/primitives";

const groups: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "PoolX",
    links: [
      { href: "/poolx", label: "Buying pools" },
      { href: "/how-it-works#poolx", label: "How pooling works" },
    ],
  },
  {
    title: "Auctions",
    links: [
      { href: "/auctions", label: "Auctions" },
      { href: "/how-it-works#auctions", label: "How bidding works" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact Us" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-ink mt-24 border-t">
      <Container className="grid gap-10 py-12 md:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-semibold">{site.name}</p>
          <p className="text-ink-muted mt-2 text-sm">
            Group buying and online auctions — two marketplaces, one account.
          </p>
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={`${g.title} links`}>
            <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">{g.title}</p>
            <ul className="mt-3 space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
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
          <p>
            © {site.name}. Legal policies (privacy, terms, refund &amp; cancellation) will be published after legal
            review.
          </p>
        </Container>
      </div>
    </footer>
  );
}
