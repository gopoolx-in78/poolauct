import type { Instrumentation } from "next";
import { pathOnly, redact } from "@/lib/redact";

/**
 * Server error reporting (Phase 10, TD-72). Writes one structured JSON line per captured server error so the host's log
 * drain / an error tracker can pick it up. Never logs headers, cookies, query strings, request bodies or raw messages:
 * only the route, the React digest (to match the user-facing error page), the error class and a redacted message.
 * When a monitoring account is approved (OD-08), forward the same record from here.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err instanceof Error ? err : null;
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  console.error(
    JSON.stringify({
      event: "request_error",
      at: new Date().toISOString(),
      digest,
      method: request.method,
      path: pathOnly(request.path),
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource ?? null,
      error: error?.name ?? typeof err,
      message: redact(error?.message ?? String(err)),
    }),
  );
};
