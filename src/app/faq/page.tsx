import type { Metadata } from "next";
import { Breadcrumbs, Container, EmptyState, JsonLd } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";
import { getPublicFaqs, seoFor, type Faq } from "@/modules/cms/server/queries";

const TOPICS: { key: Faq["topic"]; title: string }[] = [
  { key: "general", title: "General" },
  { key: "poolx", title: "PoolX buying pools" },
  { key: "auction", title: "Auctions and deposits" },
];

export async function generateMetadata(): Promise<Metadata> {
  const faqs = await getPublicFaqs();
  const { title, description } = await seoFor("faq", {
    title: "Frequently asked questions",
    description: `Answers to common questions about PoolX buying pools, online auctions, deposits and refunds on ${site.name}.`,
  });
  return pageMetadata({ title, description, path: "/faq", noindex: faqs.length === 0 });
}

export default async function FaqPage() {
  const faqs = await getPublicFaqs();
  return (
    <Container className="py-10">
      <Breadcrumbs
        siteUrl={site.url}
        items={[
          { href: "/", label: "Home" },
          { href: "/faq", label: "FAQ" },
        ]}
      />
      <h1 className="mt-6 text-5xl">Frequently asked questions</h1>
      {faqs.length === 0 ? (
        <EmptyState className="mt-10" title="Questions and answers will be published here soon." />
      ) : (
        <>
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            }}
          />
          {TOPICS.map((t) => {
            const items = faqs.filter((f) => f.topic === t.key);
            if (items.length === 0) return null;
            return (
              <section key={t.key} aria-labelledby={`faq-${t.key}`} className="mt-12 max-w-3xl">
                <h2 id={`faq-${t.key}`} className="text-3xl">
                  {t.title}
                </h2>
                <div className="divide-rule border-rule mt-4 divide-y border-y">
                  {items.map((f) => (
                    <details key={f.id} className="group py-4">
                      <summary className="font-display cursor-pointer text-xl">{f.question}</summary>
                      <p className="text-ink-muted mt-3 whitespace-pre-line">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </Container>
  );
}
