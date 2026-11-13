"use client";

import { useEffect } from "react";
import "./globals.css";

/** Replaces the root layout when it fails. Must render its own <html>/<body>. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body>
        <title>Something went wrong</title>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "6rem 1rem" }}>
          <h1 style={{ fontSize: "2.5rem" }}>Something went wrong.</h1>
          <p style={{ marginTop: "1rem" }}>Please try again in a moment.</p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                padding: "0.75rem 1.25rem",
                background: "var(--color-ink)",
                color: "var(--color-paper)",
                borderRadius: 4,
              }}
            >
              Try again
            </button>
            {/* Plain anchor on purpose: the router may be unavailable when the root layout has failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ padding: "0.75rem 1.25rem", textDecoration: "underline" }}>
              Go to the homepage
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
