import { Breadcrumbs, Container } from "@/components/ui/primitives";
import { site } from "@/config/site";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { seoFor } from "@/modules/cms/server/queries";

const META = {
  title: "About us",
  description: `About ${site.name}: a group-buying marketplace and an online auction marketplace operating under one account system.`,
  path: "/about",
};

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ ...META, ...(await seoFor("about", META)) });
}

export default function AboutPage() {
  return (
    <>
      <Container className="pt-6">
        <Breadcrumbs
          siteUrl={site.url}
          items={[
            { href: "/", label: "Home" },
            { href: "/about", label: "About Us" },
          ]}
        />
      </Container>
      <Container className="max-w-3xl py-12 md:py-16">
        <h1 className="text-5xl md:text-6xl">About us</h1>
        <div className="mt-8 space-y-6 text-lg">
          <p>
            {site.name} brings two kinds of marketplace together. <strong>PoolX</strong> helps people, businesses and
            communities combine their demand so they can buy at bulk prices. <strong>Auctions</strong> lets buyers bid
            for used vehicles and other second-hand assets in transparent, timed online auctions.
          </p>
          <p>
            The two marketplaces share one account, but they run on separate rules, separate payment records and
            separate dashboards — so a pool contribution and an auction deposit are never mixed up.
          </p>
          <p className="text-ink-muted">
            Company registration details, our address and the team behind the platform will be published here once they
            are confirmed.
          </p>
        </div>
      </Container>
    </>
  );
}
