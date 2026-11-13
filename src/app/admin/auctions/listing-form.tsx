"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormMessage, SubmitButton, TextField } from "@/components/ui/form-kit";
import { idleState } from "@/modules/core/validation";
import { saveListingAction } from "./actions";

type Values = Record<string, string>;
type Option = { value: string; label: string };

export function ListingForm({
  auctionId,
  initial,
  categories,
  depositPolicy,
}: {
  auctionId?: string;
  initial: Values;
  categories: { slug: string; name: string; isVehicle: boolean }[];
  depositPolicy: { minLabel: string | null; maxLabel: string | null };
}) {
  const [state, action] = useActionState(saveListingAction, { ...idleState, values: initial });
  const v = state.values ?? initial;
  const err = state.fieldErrors ?? {};
  const [category, setCategory] = useState(v.categorySlug);
  const [depositMode, setDepositMode] = useState(v.depositMode);
  const isVehicle = categories.find((c) => c.slug === category)?.isVehicle ?? false;

  const area = (name: string, label: string, rows: number, hint?: string, required?: boolean) => (
    <FormField label={label} hint={hint} error={err[name]} required={required}>
      {(a11y) => (
        <textarea
          name={name}
          rows={rows}
          defaultValue={v[name]}
          className="border-rule bg-surface w-full rounded border px-3 py-2"
          {...a11y}
        />
      )}
    </FormField>
  );
  const select = (name: string, label: string, options: Option[], opts: { required?: boolean; hint?: string } = {}) => (
    <FormField label={label} error={err[name]} required={opts.required} hint={opts.hint}>
      {(a11y) => (
        <select
          name={name}
          defaultValue={v[name]}
          className="border-rule bg-surface h-11 w-full rounded border px-3"
          {...a11y}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
  const field = (
    name: string,
    label: string,
    extra: Omit<Parameters<typeof TextField>[0], "name" | "label" | "state"> = {},
  ) => <TextField name={name} label={label} state={state} defaultValue={v[name]} {...extra} />;

  return (
    <form action={action} className="grid gap-8" noValidate>
      <FormMessage state={state} />
      {auctionId ? <input type="hidden" name="auctionId" value={auctionId} /> : null}
      <input type="hidden" name="isVehicle" value={isVehicle ? "true" : "false"} />

      <fieldset className="grid gap-5 md:grid-cols-2">
        <legend className="font-display mb-2 text-xl">Item</legend>
        {field("title", "Title", { required: true })}
        {field("slug", "URL slug", { required: true, hint: "lowercase-with-hyphens; fixed once published" })}
        <FormField label="Category" error={err.categorySlug} required>
          {(a11y) => (
            <select
              name="categorySlug"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border-rule bg-surface h-11 w-full rounded border px-3"
              {...a11y}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                  {c.isVehicle ? " (vehicle)" : ""}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {select(
          "condition",
          "Condition",
          [
            { value: "LIKE_NEW", label: "Like new" },
            { value: "GOOD", label: "Good" },
            { value: "FAIR", label: "Fair" },
            { value: "POOR", label: "Poor" },
            { value: "FOR_PARTS", label: "For parts / not working" },
          ],
          { required: true },
        )}
        {field("brand", "Brand")}
        {field("model", "Model")}
        {field("year", "Year", { inputMode: "numeric" })}
        <div />
        {field("city", "City", { required: true })}
        {field("state", "State", { required: true })}
        <div className="md:col-span-2">
          {area("description", "Description", 6, "Factual condition, contents and known defects.", true)}
        </div>
        <div className="md:col-span-2">{area("pickupTerms", "Pickup / delivery terms", 3, undefined, true)}</div>
        <div className="md:col-span-2">
          {area(
            "charges",
            "Additional charges payable by the winner",
            3,
            "One per line: “Label: amount in ₹”. Leave blank if none. Shown before bidding.",
          )}
        </div>
      </fieldset>

      {isVehicle ? (
        <fieldset className="grid gap-5 md:grid-cols-3">
          <legend className="font-display mb-2 text-xl">Vehicle details</legend>
          {field("manufacturer", "Manufacturer", { required: true })}
          {field("variant", "Variant")}
          {field("registrationState", "Registration state", { required: true })}
          {field("registrationMasked", "Registration number (masked)", {
            required: true,
            hint: "Hide characters with •, e.g. MH 12 •• ••34",
          })}
          {select(
            "fuelType",
            "Fuel",
            [
              { value: "", label: "Choose…" },
              ...["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID"].map((f) => ({
                value: f,
                label: f[0] + f.slice(1).toLowerCase(),
              })),
            ],
            { required: true },
          )}
          {select(
            "transmission",
            "Transmission",
            [
              { value: "", label: "Choose…" },
              { value: "MANUAL", label: "Manual" },
              { value: "AUTOMATIC", label: "Automatic" },
            ],
            { required: true },
          )}
          {field("odometerKm", "Odometer (km)", { required: true, inputMode: "numeric" })}
          {field("ownersCount", "Number of owners", { required: true, inputMode: "numeric" })}
          {field("insuranceValidUntil", "Insurance valid until", { type: "date" })}
          {select("pucStatus", "PUC", [
            { value: "UNKNOWN", label: "Unknown" },
            { value: "VALID", label: "Valid" },
            { value: "EXPIRED", label: "Expired" },
          ])}
          <div className="grid gap-5 md:col-span-3 md:grid-cols-2">
            {area("accidentDisclosure", "Accident disclosure", 2, "Write “None reported” if none.", true)}
            {area("damageDisclosure", "Damage disclosure", 2, undefined, true)}
            {area("serviceHistory", "Service history", 2)}
            {area("ownershipTransferTerms", "Ownership transfer terms", 2, undefined, true)}
          </div>
          <p className="text-ink-muted text-sm md:col-span-3">
            RC verification starts as “not verified” and is recorded separately once documents are checked.
          </p>
        </fieldset>
      ) : null}

      <fieldset className="grid gap-5 md:grid-cols-3">
        <legend className="font-display mb-2 text-xl">Bidding</legend>
        {field("startingPrice", "Starting price (₹)", { required: true, inputMode: "decimal" })}
        {field("minIncrement", "Minimum increment (₹)", { required: true, inputMode: "decimal" })}
        <div />
        {field("reservePrice", "Reserve price (₹, optional)", { inputMode: "decimal", hint: "Never shown to bidders" })}
        {select("reserveDisclosure", "Reserve disclosure", [
          { value: "MET_FLAG", label: "Show “reserve met / not met”" },
          { value: "HIDDEN", label: "Say a reserve exists, nothing more" },
        ])}
        <div />
        {field("startsAt", "Starts (IST)", { type: "datetime-local", required: true })}
        {field("endsAt", "Ends (IST)", { type: "datetime-local", required: true })}
        <div />
        {field("antiSnipeMinutes", "Anti-snipe window (minutes)", {
          inputMode: "numeric",
          hint: "Bids in the last N minutes extend the end. 0 = off",
        })}
        {field("antiSnipeExtendMinutes", "Extend by (minutes)", { inputMode: "numeric" })}
        {field("maxExtensions", "Maximum extensions", { inputMode: "numeric" })}
      </fieldset>

      <fieldset className="border-accent grid gap-5 border-l-4 pl-4 md:grid-cols-3">
        <legend className="font-display mb-2 text-xl">Refundable participation deposit (mandatory)</legend>
        <p className="text-ink-muted text-sm md:col-span-3">
          Every auction requires a deposit above ₹0 before anyone can bid. It is refunded in full to non-winners and
          credited to the winner&rsquo;s invoice. The amount is calculated and frozen when you publish
          {depositPolicy.minLabel
            ? `, within the platform limits (minimum ${depositPolicy.minLabel}${depositPolicy.maxLabel ? `, maximum ${depositPolicy.maxLabel}` : ""})`
            : ""}
          .
        </p>
        {!depositPolicy.minLabel ? (
          <p role="alert" className="border-danger bg-danger/5 border-l-4 px-4 py-3 text-sm md:col-span-3">
            No platform deposit policy is configured, so this auction can be saved as a draft but not published. Set it
            under Deposit policy.
          </p>
        ) : null}
        <FormField label="Deposit calculated as" error={err.depositMode} required>
          {(a11y) => (
            <select
              name="depositMode"
              value={depositMode}
              onChange={(e) => setDepositMode(e.target.value)}
              className="border-rule bg-surface h-11 w-full rounded border px-3"
              {...a11y}
            >
              <option value="">Choose…</option>
              <option value="FIXED">Fixed amount</option>
              <option value="PERCENT_OF_STARTING">Percentage of starting price</option>
            </select>
          )}
        </FormField>
        {field(
          "depositValue",
          depositMode === "PERCENT_OF_STARTING" ? "Deposit (% of starting price)" : "Deposit amount (₹)",
          {
            required: true,
            inputMode: "decimal",
          },
        )}
        {field("winnerPaymentDeadlineHours", "Winner pays within (hours)", { required: true, inputMode: "numeric" })}
        <div className="md:col-span-3">
          {area(
            "depositTerms",
            "Deposit terms shown to bidders",
            4,
            "Bidders must accept these before paying. Changing them after publishing is not possible.",
            true,
          )}
        </div>
      </fieldset>

      <SubmitButton className="self-start">{auctionId ? "Save draft" : "Create draft"}</SubmitButton>
    </form>
  );
}
