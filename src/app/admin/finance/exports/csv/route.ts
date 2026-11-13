import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccount } from "@/modules/core/server/auth";

const query = z.object({
  kind: z.enum(["payments", "refunds", "ledger"]),
  domain: z.enum(["poolx", "auction"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Fixed column order per report (matches api.admin_export), so empty exports still have a header row. */
const COLUMNS = {
  payments: [
    "payment_id",
    "created_at",
    "captured_at",
    "purpose",
    "status",
    "amount_paise",
    "currency",
    "provider",
    "provider_order_id",
    "provider_payment_id",
    "reference_id",
    "user_id",
  ],
  refunds: [
    "refund_id",
    "created_at",
    "refunded_at",
    "reason",
    "status",
    "amount_paise",
    "provider_refund_id",
    "subject_id",
    "user_id",
  ],
  ledger: [
    "entry_id",
    "journal_id",
    "posted_at",
    "kind",
    "reference_type",
    "reference_id",
    "account_code",
    "debit_paise",
    "credit_paise",
    "user_id",
  ],
} as const satisfies Record<string, readonly string[]>;

/** CSV download for finance staff (finance.reports.export). Dates are IST calendar days, `to` inclusive. Audited in SQL. */
export async function GET(request: Request) {
  const account = await getAccount();
  if (
    !account ||
    account.status !== "ACTIVE" ||
    account.aal !== "aal2" ||
    !account.permissions.includes("finance.reports.export")
  ) {
    return new Response("Not found", { status: 404 });
  }
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return new Response("Invalid export request", { status: 400 });
  const { kind, domain, from, to } = parsed.data;
  const fromTs = new Date(`${from}T00:00:00+05:30`);
  const toTs = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("admin_export", {
    p_kind: kind,
    p_domain: domain,
    p_from: fromTs.toISOString(),
    p_to: toTs.toISOString(),
  });
  if (error) {
    const message = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : "Export failed";
    return new Response(message, { status: 400 });
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return new Response(toCsv(rows, COLUMNS[kind]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${domain}-${kind}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
