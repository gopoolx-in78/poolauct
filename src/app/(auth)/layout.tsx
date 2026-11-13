import type { Metadata } from "next";
import { Container } from "@/components/ui/primitives";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <Container className="flex justify-center py-12 md:py-20">
      <div className="w-full max-w-md">{children}</div>
    </Container>
  );
}
