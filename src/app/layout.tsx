import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteBanners } from "@/components/layout/site-banners";
import { SiteHeader, SkipLink } from "@/components/layout/site-header";
import { themeInitScript } from "@/components/layout/theme-toggle";
import { site } from "@/config/site";
import { getSiteDesign } from "@/modules/cms/server/queries";
import { ADMIN_THEME_CSS, compileThemeCss } from "@/modules/theme/compile";
import { DEFAULT_THEME } from "@/modules/theme/schema";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false, // only used when a published theme selects it
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — Group buying & online auctions`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  // Canonical URLs are set per page via pageMetadata() — never inherit a site-wide canonical.
  openGraph: { type: "website", siteName: site.name, locale: site.locale },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0c" },
  ],
};

/** Published theme as CSS variables; falls back to the shipped design if it ever fails validation. */
function themeCss(config: typeof DEFAULT_THEME) {
  try {
    return compileThemeCss(config);
  } catch {
    return compileThemeCss(DEFAULT_THEME);
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { config } = await getSiteDesign();
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      data-default-scheme={config.colorScheme}
      className={`${fraunces.variable} ${plexSans.variable} ${plexSerif.variable} ${plexMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Compiled from allowlisted, validated tokens only (src/modules/theme/compile.ts). */}
        <style
          dangerouslySetInnerHTML={{
            __html: `${themeCss(config)}
${ADMIN_THEME_CSS}`,
          }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <SiteHeader design={config} />
        <SiteBanners banners={config.banners} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter design={config} />
      </body>
    </html>
  );
}
