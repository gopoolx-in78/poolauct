import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/** Private areas are disallowed here AND served with noindex (robots.txt alone is not access control). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/account",
          "/admin",
          "/seller",
          "/login",
          "/register",
          "/verify",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", site.url).toString(),
    host: site.url,
  };
}
