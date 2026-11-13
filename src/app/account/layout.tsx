import type { Metadata } from "next";
import { Container } from "@/components/ui/primitives";
import { AccountNav } from "./account-nav";

export const metadata: Metadata = {
  title: { default: "My account", template: "%s | My account" },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <Container className="grid gap-10 py-10 md:grid-cols-[14rem_1fr] md:py-14">
      <AccountNav />
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
