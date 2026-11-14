"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { MEDIA_ACCEPT, MEDIA_MAX_PER_LISTING, mediaSrc, type Media } from "@/modules/core/media";
import { removeMediaAction, updateMediaAction } from "./media-actions";

type Props = {
  target: "auction" | "pool";
  ownerId: string;
  items: Media[];
  editable: boolean;
};

/** Staff photo manager for a draft auction or pool (TD-74): upload with alt text, caption, re-order, remove. */
export function MediaManager({ target, ownerId, items, editable }: Props) {
  const full = items.length >= MEDIA_MAX_PER_LISTING;
  return (
    <section aria-labelledby="photos-h">
      <h2 id="photos-h" className="text-2xl">
        Photos
      </h2>
      <p className="text-ink-muted mt-1 text-sm">
        {editable
          ? `JPEG, PNG or WebP up to 10 MB, at least 320 px on the shorter side. Up to ${MEDIA_MAX_PER_LISTING} photos; the first one is the cover. Photos are converted to WebP and their location data is removed.`
          : "Photos are frozen once the listing is published."}
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm">No photos yet.</p>
      ) : (
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m, i) => (
            <li key={m.id} className="border-rule rounded-md border p-3">
              <Image
                src={mediaSrc(m.thumb.path)}
                alt={m.alt}
                width={m.thumb.width}
                height={m.thumb.height}
                unoptimized
                className="bg-ink/5 aspect-[4/3] w-full rounded object-contain"
              />
              <p className="text-ink-muted mt-2 font-mono text-xs">
                {i === 0 ? "Cover · " : ""}
                {m.display.width}×{m.display.height}
              </p>
              {editable ? (
                <>
                  <form action={updateMediaAction} className="mt-2 flex items-end gap-2">
                    <Hidden target={target} ownerId={ownerId} mediaId={m.id} />
                    <div className="grow">
                      <FormField label="Alt text">
                        {(f) => <Input {...f} name="alt" defaultValue={m.alt} required minLength={3} maxLength={200} />}
                      </FormField>
                    </div>
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  </form>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={updateMediaAction}>
                      <Hidden target={target} ownerId={ownerId} mediaId={m.id} />
                      <input type="hidden" name="move" value="up" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="md"
                        disabled={i === 0}
                        aria-label={`Move up: ${m.alt}`}
                      >
                        Move up
                      </Button>
                    </form>
                    <form action={updateMediaAction}>
                      <Hidden target={target} ownerId={ownerId} mediaId={m.id} />
                      <input type="hidden" name="move" value="down" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="md"
                        disabled={i === items.length - 1}
                        aria-label={`Move down: ${m.alt}`}
                      >
                        Move down
                      </Button>
                    </form>
                    <form action={removeMediaAction}>
                      <Hidden target={target} ownerId={ownerId} mediaId={m.id} />
                      <Button type="submit" variant="danger" size="md" aria-label={`Remove: ${m.alt}`}>
                        Remove
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm">{m.alt}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && !full ? <UploadForm target={target} ownerId={ownerId} /> : null}
      {editable && full ? <p className="mt-4 text-sm">This listing has the maximum number of photos.</p> : null}
    </section>
  );
}

function Hidden({ target, ownerId, mediaId }: { target: string; ownerId: string; mediaId: string }) {
  return (
    <>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input type="hidden" name="mediaId" value={mediaId} />
    </>
  );
}

function UploadForm({ target, ownerId }: { target: "auction" | "pool"; ownerId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/media", { method: "POST", body: new FormData(form) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "error", text: json.error ?? "The photo could not be uploaded." });
        return;
      }
      formRef.current?.reset();
      setMessage({ tone: "ok", text: "Photo added." });
      startTransition(() => router.refresh());
    } catch {
      setMessage({ tone: "error", text: "The upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-label="Add a photo"
      className="border-rule mt-6 grid gap-3 rounded-md border p-4 sm:max-w-xl"
    >
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="id" value={ownerId} />
      <FormField label="Photo" required>
        {(f) => <input {...f} name="file" type="file" accept={MEDIA_ACCEPT} className="text-sm" />}
      </FormField>
      <FormField label="Alt text" hint="What the photo shows, for people using screen readers." required>
        {(f) => <Input {...f} name="alt" minLength={3} maxLength={200} />}
      </FormField>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload photo"}
        </Button>
      </div>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className="text-sm">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
