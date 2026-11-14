import "server-only";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  MEDIA_BUCKET,
  MEDIA_DISPLAY_MAX,
  MEDIA_MAX_INPUT_PIXELS,
  MEDIA_MIN_SIDE,
  MEDIA_THUMB_MAX,
  sniffImageType,
} from "../media";

export class MediaError extends Error {
  constructor(
    public readonly code: "UNSUPPORTED_TYPE" | "UNREADABLE" | "TOO_SMALL" | "TOO_LARGE" | "STORAGE",
    message: string,
  ) {
    super(message);
  }
}

export type ProcessedImage = {
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
};

/** WebP output bigger than this is refused (the bucket's own limit is 2 MB). */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/**
 * Re-encodes an uploaded image (TD-74): checks the magic bytes, decodes with a pixel limit, applies the EXIF
 * orientation, drops all metadata (EXIF / GPS / ICC comments are not copied by sharp unless asked), and writes two WebP
 * sizes. The original bytes are never stored.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (!sniffImageType(input)) throw new MediaError("UNSUPPORTED_TYPE", "Upload a JPEG, PNG or WebP photo.");
  const open = () => sharp(input, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS, failOn: "error", animated: false });

  let meta: Metadata;
  try {
    meta = await open().metadata();
  } catch {
    throw new MediaError("UNREADABLE", "That file could not be read as an image.");
  }
  if (!meta.width || !meta.height) throw new MediaError("UNREADABLE", "That file could not be read as an image.");
  if (meta.width * meta.height > MEDIA_MAX_INPUT_PIXELS)
    throw new MediaError("TOO_LARGE", "That image has too many pixels (40 megapixels at most).");
  if (Math.min(meta.width, meta.height) < MEDIA_MIN_SIDE)
    throw new MediaError("TOO_SMALL", `Photos must be at least ${MEDIA_MIN_SIDE} pixels on the shorter side.`);

  try {
    const display = await open()
      .rotate()
      .resize({ width: MEDIA_DISPLAY_MAX, height: MEDIA_DISPLAY_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await open()
      .rotate()
      .resize({ width: MEDIA_THUMB_MAX, height: MEDIA_THUMB_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer({ resolveWithObject: true });
    if (display.data.byteLength > MAX_OUTPUT_BYTES)
      throw new MediaError("TOO_LARGE", "That image is too detailed to store; try a smaller photo.");
    return {
      display: display.data,
      thumb: thumb.data,
      width: display.info.width,
      height: display.info.height,
      thumbWidth: thumb.info.width,
      thumbHeight: thumb.info.height,
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("UNREADABLE", "That file could not be read as an image.");
  }
}

/** Writes both sizes to the public bucket with the service role; returns the new media id. */
export async function storeImage(image: ProcessedImage): Promise<string> {
  const id = randomUUID();
  const storage = createSupabaseAdminClient().storage.from(MEDIA_BUCKET);
  const opts = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  const a = await storage.upload(`${id}/display.webp`, image.display, opts);
  const b = a.error ? a : await storage.upload(`${id}/thumb.webp`, image.thumb, opts);
  if (a.error || b.error) {
    await deleteStoredImage(id);
    console.error("media upload failed", { name: a.error?.name ?? b.error?.name });
    throw new MediaError("STORAGE", "The photo could not be saved. Please try again.");
  }
  return id;
}

/** Best-effort removal of both files (used after a failed registration and when staff remove a photo). */
export async function deleteStoredImage(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const { error } = await createSupabaseAdminClient()
    .storage.from(MEDIA_BUCKET)
    .remove([`${id}/display.webp`, `${id}/thumb.webp`]);
  if (error) console.error("media delete failed", { name: error.name });
}
