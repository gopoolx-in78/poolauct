import type { Metadata } from "next";
import { Container } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

/**
 * Admin chrome uses fixed styling (TD-13) and never reads the session at the top level; each page gates access
 * inside a Suspense boundary via requireStaff().
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="border-ink border-t-4">
      <Container className="py-10">{children}</Container>
    </div>
  );
}
