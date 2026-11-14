/** Shared media types and rules (Phase 10, TD-74). Safe for client and server code. */
import { publicEnv } from "@/lib/env";

export const MEDIA_BUCKET = "public-media";
/** Largest upload accepted before re-encoding. */
export const MEDIA_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Largest decoded image (protects against decompression bombs). */
export const MEDIA_MAX_INPUT_PIXELS = 40_000_000;
export const MEDIA_MIN_SIDE = 320;
export const MEDIA_DISPLAY_MAX = 1600;
export const MEDIA_THUMB_MAX = 480;
export const MEDIA_MAX_PER_LISTING = 12;
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";

export type MediaImage = { path: string; width: number; height: number };
export type Media = { id: string; alt: string; display: MediaImage; thumb: MediaImage };

export type SniffedType = "jpeg" | "png" | "webp";

/**
 * Identifies an image by its magic bytes, never by file name or declared Content-Type. Only JPEG, PNG and WebP are
 * accepted; SVG (scriptable), GIF, HEIC and everything else are refused.
 */
export function sniffImageType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** Public URL of a stored image (the bucket is public-read; paths are always `<uuid>/<size>.webp`). */
export function mediaUrl(supabaseUrl: string, path: string): string {
  if (!/^[0-9a-f-]{36}\/(display|thumb)\.webp$/.test(path)) throw new Error("invalid media path");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/** Public URL for a stored image on this deployment's Supabase project. */
export function mediaSrc(path: string): string {
  return mediaUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "", path);
}
