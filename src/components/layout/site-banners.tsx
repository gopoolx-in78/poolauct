import Link from "next/link";
import { Container } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { ThemeConfig } from "@/modules/theme/schema";

const TONE: Record<ThemeConfig["banners"][number]["tone"], string> = {
  info: "border-info bg-info/10",
  success: "border-success bg-success/10",
  warning: "border-warning bg-warning/10",
};

/** Site-wide announcement banners managed in the theme manager (plain text + optional internal link). */
export function SiteBanners({ banners }: { banners: ThemeConfig["banners"] }) {
  const shown = banners.filter((b) => b.enabled);
  if (shown.length === 0) return null;
  return (
    <aside aria-label="Announcements">
      {shown.map((b) => (
        <div key={b.id} className={cn("border-b border-l-4 text-sm", TONE[b.tone])}>
          <Container className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <p>{b.message}</p>
            {b.href && (
              <Link href={b.href} className="font-medium underline underline-offset-4">
                {b.linkLabel}
              </Link>
            )}
          </Container>
        </div>
      ))}
    </aside>
  );
}
