import type { Metadata } from "next";
import { Container } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

/**
 * Admin chrome uses fixed styling (TD-13): `data-admin` re-pins the shipped design tokens (ADMIN_THEME_CSS in the
 * root layout), so a published public theme never changes the admin area. Never reads the session at the top level;
 * each page gates access inside a Suspense boundary via requireStaff().
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div data-admin className="border-ink bg-paper text-ink border-t-4 font-sans">
      <Container className="py-10">{children}</Container>
    </div>
  );
}
