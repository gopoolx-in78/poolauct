"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

/** WhatsApp share link + copy-link button (Instagram has no web share URL, so the link is copied for it). */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${title} — join this buying pool: ${url}`)}`;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a href={wa} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        Share on WhatsApp
      </a>
      <button
        type="button"
        className="inline-flex items-center gap-1 underline underline-offset-4"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}
        {copied ? "Link copied" : "Copy link (for Instagram & others)"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}
