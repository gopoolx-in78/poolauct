import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { PaymentProvider, ProviderName } from "../types";
import { SandboxProvider } from "./sandbox";

export class ProviderUnavailableError extends Error {}

/** The provider used for NEW payments. */
export function getActiveProvider(): PaymentProvider {
  return getProvider(getServerEnv().PAYMENT_PROVIDER);
}

/** A provider by name (webhooks and refunds use the provider that took the original payment). */
export function getProvider(name: string): PaymentProvider {
  const env = getServerEnv();
  switch (name as ProviderName) {
    case "sandbox":
      if (env.APP_ENV === "production")
        throw new ProviderUnavailableError("sandbox provider is disabled in production");
      if (!env.SANDBOX_WEBHOOK_SECRET) throw new ProviderUnavailableError("sandbox provider is not configured");
      return new SandboxProvider(env.SANDBOX_WEBHOOK_SECRET);
    case "razorpay":
      // Adapter pending owner decision OD-02 and provider onboarding. Never fake it.
      throw new ProviderUnavailableError("Razorpay adapter is not implemented yet (OD-02)");
    default:
      throw new ProviderUnavailableError(`unknown payment provider: ${name}`);
  }
}

export function isSandboxEnabled(): boolean {
  const env = getServerEnv();
  return env.APP_ENV !== "production" && env.PAYMENT_PROVIDER === "sandbox" && Boolean(env.SANDBOX_WEBHOOK_SECRET);
}
