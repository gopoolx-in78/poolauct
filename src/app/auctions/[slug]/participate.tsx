"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { formatINR, paise } from "@/lib/money";
import { idleState } from "@/modules/core/validation";
import { placeBidAction, startDepositAction } from "../actions";

export function DepositForm({
  auctionId,
  slug,
  termsVersion,
  depositPaise,
  resume,
}: {
  auctionId: string;
  slug: string;
  termsVersion: string;
  depositPaise: string;
  resume: boolean;
}) {
  const [state, action] = useActionState(startDepositAction, idleState);
  const err = state.fieldErrors?.acceptTerms;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="auctionId" value={auctionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="termsVersion" value={termsVersion} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptTerms"
          className="mt-1 size-4"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? "terms-err" : undefined}
        />
        <span>
          I accept this auction&rsquo;s participation terms and deposit rules (version {termsVersion.slice(0, 14)}).
        </span>
      </label>
      {err ? (
        <p id="terms-err" role="alert" className="text-danger text-sm">
          {err}
        </p>
      ) : null}
      <SubmitButton variant="accent">
        {resume ? "Continue deposit payment" : `Pay refundable deposit ${formatINR(paise(depositPaise))}`}
      </SubmitButton>
    </form>
  );
}

export function BidForm({
  auctionId,
  slug,
  minNextPaise,
  idempotencyKey,
}: {
  auctionId: string;
  slug: string;
  minNextPaise: string;
  idempotencyKey: string;
}) {
  const [state, action] = useActionState(placeBidAction, idleState);
  const min = paise(minNextPaise);
  const minRupees = (min / 100n).toString();
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="auctionId" value={auctionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <TextField
        name="amount"
        label="Your bid (₹)"
        inputMode="decimal"
        required
        defaultValue={minRupees}
        hint={`Minimum next bid ${formatINR(min)}. Bids are checked and timed by our servers.`}
        state={state}
      />
      <SubmitButton variant="accent">Place bid</SubmitButton>
    </form>
  );
}
