import { Breadcrumbs, Container, EmptyState } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact us",
  description: `How to get in touch with ${site.name} about buying pools, auctions, your account or selling with us.`,
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/contact", label: "Contact Us" },
          ]}
        />
      </Container>
      <Container className="max-w-3xl py-12 md:py-16">
        <h1 className="text-5xl md:text-6xl">Contact us</h1>
        <p className="text-ink-muted mt-4 text-lg">
          Questions about a pool, an auction, your account or selling with us — we want to hear from you.
        </p>
        <EmptyState className="mt-10" title="Contact channels are being set up">
          Our support email, phone number and contact form will be published here once they are confirmed. Account
          holders will also be able to raise support tickets from their dashboard.
        </EmptyState>
      </Container>
    </>
  );
}
