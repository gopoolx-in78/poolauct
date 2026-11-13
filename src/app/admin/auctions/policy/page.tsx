import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { requireStaff } from "@/modules/core/server/auth";
import { NO_CAP_PAISE, loadDepositPolicy, policyLabels } from "../admin-data";
import { paiseToRupeesString } from "../form-data";
import { PolicyForm } from "./policy-form";

export const metadata = { title: "Deposit policy" };

export default function DepositPolicyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Policy />
    </Suspense>
  );
}

async function Policy() {
  await requireStaff("/admin/auctions/policy", "auction.deposit.config");
  const policy = await loadDepositPolicy();
  const labels = policyLabels(policy);
  const max =
    policy?.globalMaxPaise && BigInt(policy.globalMaxPaise) < NO_CAP_PAISE
      ? paiseToRupeesString(policy.globalMaxPaise)
      : "";
  return (
    <div className="max-w-3xl">
      <p className="text-ink-muted font-mono text-xs tracking-[0.2em] uppercase">
        <Link href="/admin/auctions" className="hover:underline">
          Auctions
        </Link>{" "}
        / Deposit policy
      </p>
      <h1 className="mt-2 text-4xl">Deposit policy</h1>
      <p className="text-ink-muted mt-3">
        Every auction requires a refundable participation deposit. These platform limits clamp the deposit each auction
        calculates when it is published; already-published auctions keep their frozen amount.
      </p>
      <p className="mt-4 text-sm">
        Current:{" "}
        {labels.minLabel ? (
          <strong>
            minimum {labels.minLabel}
            {labels.maxLabel ? `, maximum ${labels.maxLabel}` : ", no maximum"}
          </strong>
        ) : (
          <strong className="text-danger">not configured — auctions cannot be published until it is set</strong>
        )}
        . Bidder verification level: {policy?.bidderVerificationLevel ?? "EMAIL"} (pending business decision OD-05).
      </p>
      <div className="mt-8">
        <PolicyForm initial={{ min: paiseToRupeesString(policy?.globalMinPaise), max }} />
      </div>
    </div>
  );
}
