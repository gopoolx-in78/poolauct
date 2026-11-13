import { Breadcrumbs, Container, EmptyState, Progress, SectionHeading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { applyBps, formatINR, rupees, subPaise } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "PoolX — Join buying pools and unlock bulk prices together",
  description:
    "PoolX lets people, businesses and housing societies combine their purchasing demand so pools can unlock quantity-based discount tiers from verified sellers.",
  path: "/poolx",
});

const steps = [
  [
    "Discover & join",
    "Find a pool for something you need, choose your quantity and read the pool’s rules before joining.",
  ],
  [
    "Secure contribution",
    "Pay your contribution through our payment partner. It counts only once the payment is confirmed to our servers.",
  ],
  [
    "Negotiation",
    "As membership grows, the pool unlocks better price tiers and the deal is confirmed with a verified seller.",
  ],
  ["Deal locked", "When the pool’s conditions are met, the price is locked and individual orders are created."],
  ["Direct delivery", "Each member’s order is delivered individually, with tracking where the seller supports it."],
] as const;

const categories = [
  "Electronics",
  "Smartphones",
  "Laptops",
  "Groceries",
  "Construction materials",
  "Cement and steel",
  "Society purchases",
  "Office supplies",
  "Household products",
  "Commercial supplies",
  "Services",
  "Custom group purchases",
];

// Illustrative only — mirrors the example tiers in the requirements; not a live pool or a price promise.
const exampleBase = rupees(1000);
const exampleTiers = [
  { members: 10, bps: 500 },
  { members: 20, bps: 1000 },
  { members: 40, bps: 1500 },
  { members: 50, bps: 2000 },
];

export default function PoolXPage() {
  return (
    <div data-module="poolx">
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/poolx", label: "PoolX" },
          ]}
        />
      </Container>

      <section aria-labelledby="poolx-hero" className="border-rule border-b">
        <Container className="grid gap-12 py-12 md:py-20 lg:grid-cols-[3fr_2fr] lg:items-end">
          <div>
            <p className="text-accent font-mono text-xs tracking-[0.2em] uppercase">PoolX · Group buying</p>
            <h1 id="poolx-hero" className="mt-4 text-5xl md:text-7xl">
              Power of People.
              <br />
              Power of Pooling.
            </h1>
            <p className="text-ink-muted mt-6 max-w-xl text-lg md:text-xl">
              Join buying pools, combine purchasing power and negotiate like a corporation — whether you need one phone
              or a truckload of cement.
            </p>
          </div>

          <figure className="border-ink bg-surface border p-5" aria-labelledby="tier-caption">
            <figcaption id="tier-caption" className="flex items-center justify-between gap-2">
              <span className="font-display text-lg">How price tiers work</span>
              <span className="border-warning text-warning rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase">
                Illustration
              </span>
            </figcaption>
            <p className="text-ink-muted mt-1 text-sm">
              Example only — not a live pool. Each real pool publishes its own tiers.
            </p>
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Example discount tiers for an item with a reference price of ₹1,000</caption>
              <thead className="text-ink-muted font-mono text-xs tracking-wide uppercase">
                <tr>
                  <th scope="col" className="py-2 font-normal">
                    Members
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    Discount
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Unit price
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {exampleTiers.map((t) => (
                  <tr key={t.members} className="border-rule border-t">
                    <td className="py-2">{t.members}+</td>
                    <td className="py-2">{t.bps / 100}%</td>
                    <td className="py-2 text-right">
                      {formatINR(subPaise(exampleBase, applyBps(exampleBase, t.bps)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Progress className="mt-4" value={2} max={4} label="Example: two of four tiers unlocked" />
          </figure>
        </Container>
      </section>

      <section aria-labelledby="pools-title" className="mt-16">
        <Container>
          <SectionHeading eyebrow="Open pools" title="Buying pools" id="pools-title" />
          <EmptyState className="mt-8" title="No pools are open yet">
            Live pools will appear here with their real member counts, price tiers and deadlines as soon as they are
            published.
          </EmptyState>
        </Container>
      </section>

      <section aria-labelledby="poolx-how" className="mt-20">
        <Container>
          <SectionHeading eyebrow="How PoolX works" title="Five steps from demand to delivery" id="poolx-how" />
          <ol className="bg-rule mt-10 grid gap-px md:grid-cols-5">
            {steps.map(([title, body], i) => (
              <li key={title} className="bg-paper p-5">
                <span className="text-accent font-mono text-sm">0{i + 1}</span>
                <h3 className="mt-3 text-xl">{title}</h3>
                <p className="text-ink-muted mt-2 text-sm">{body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="poolx-cats" className="mt-20">
        <Container>
          <SectionHeading eyebrow="What people pool" title="Categories" id="poolx-cats">
            From everyday electronics to building materials and housing-society purchases.
          </SectionHeading>
          <ul className="mt-8 flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c} className="border-rule rounded-full border px-4 py-2 text-sm">
                {c}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </div>
  );
}
