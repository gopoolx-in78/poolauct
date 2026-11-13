import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Container, Skeleton } from "@/components/ui/primitives";
import { formatINR, paise } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAccount } from "@/modules/core/server/auth";
import { isSandboxEnabled } from "@/modules/payments/server/registry";
import { sandboxCompleteAction } from "./actions";

export const metadata = { title: "Test payment", robots: { index: false, follow: false } };

type Attempt = {
  id: string;
  purpose: string;
  amountPaise: string;
  status: string;
  provider: string | null;
  expiresAt: string;
  pool: { slug: string; title: string; quantity: number; unitLabel: string } | null;
  auction: { slug: string; title: string; kind: "deposit" | "purchase" } | null;
};

export default function SandboxCheckoutPage({ params }: PageProps<"/payments/sandbox/[attemptId]">) {
  return (
    <Container className="max-w-xl py-12">
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Checkout params={params} />
      </Suspense>
    </Container>
  );
}

async function Checkout({ params }: { params: PageProps<"/payments/sandbox/[attemptId]">["params"] }) {
  const { attemptId } = await params;
  if (!isSandboxEnabled() || !/^[0-9a-f-]{36}$/.test(attemptId)) notFound();
  await requireAccount(`/payments/sandbox/${attemptId}`);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.schema("api").rpc("payments_get_my_attempt", { p_attempt: attemptId });
  const attempt = data as Attempt | null;
  if (!attempt || attempt.provider !== "sandbox") notFound();

  return (
    <>
      <div role="note" className="border-warning bg-warning/10 border-2 px-4 py-3">
        <p className="font-mono text-xs tracking-[0.2em] uppercase">Test mode</p>
        <p className="mt-1 text-sm">
          This is a <strong>test payment page</strong>. No real money moves. It exists only in development and testing
          and is disabled in production.
        </p>
      </div>
      <h1 className="mt-8 text-4xl">Test payment</h1>
      <dl className="divide-rule border-rule mt-6 divide-y border-y">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-ink-muted">For</dt>
          <dd className="text-right">
            {attempt.pool
              ? `${attempt.pool.title} · ${attempt.pool.quantity} ${attempt.pool.unitLabel}`
              : attempt.auction
                ? `${attempt.auction.title} · ${attempt.auction.kind === "deposit" ? "refundable participation deposit" : "invoice balance"}`
                : attempt.purpose}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-ink-muted">Amount</dt>
          <dd className="font-mono text-lg tabular-nums">{formatINR(paise(attempt.amountPaise))}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-ink-muted">Status</dt>
          <dd>{attempt.status}</dd>
        </div>
      </dl>

      {attempt.status === "PENDING" ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <form action={sandboxCompleteAction}>
            <input type="hidden" name="attemptId" value={attempt.id} />
            <input type="hidden" name="outcome" value="captured" />
            <Button type="submit">Simulate successful payment</Button>
          </form>
          <form action={sandboxCompleteAction}>
            <input type="hidden" name="attemptId" value={attempt.id} />
            <input type="hidden" name="outcome" value="failed" />
            <Button type="submit" variant="secondary">
              Simulate failed payment
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-8 text-sm">This payment is no longer awaiting action.</p>
      )}
    </>
  );
}
