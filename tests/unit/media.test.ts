import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/http";
import { mediaUrl, sniffImageType } from "@/modules/core/media";
import { MediaError, processImage } from "@/modules/core/server/media";

const jpeg = (width: number, height: number, withExif = false) => {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  return (
    withExif ? img.withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "Secret Owner" } } }) : img
  ).toBuffer();
};

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP by their magic bytes", async () => {
    expect(sniffImageType(await jpeg(10, 10))).toBe("jpeg");
    const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#fff" } })
      .png()
      .toBuffer();
    expect(sniffImageType(png)).toBe("png");
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .webp()
      .toBuffer();
    expect(sniffImageType(webp)).toBe("webp");
  });

  it("refuses SVG, GIF, HTML and empty input whatever the file is called", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe(null);
    expect(sniffImageType(text("GIF89a......"))).toBe(null);
    expect(sniffImageType(text("<!doctype html><html>"))).toBe(null);
    expect(sniffImageType(new Uint8Array())).toBe(null);
  });
});

describe("processImage", () => {
  it("re-encodes to two WebP sizes within the size limits", async () => {
    const out = await processImage(await jpeg(3200, 2400));
    expect(sniffImageType(out.display)).toBe("webp");
    expect(sniffImageType(out.thumb)).toBe("webp");
    expect([out.width, out.height]).toEqual([1600, 1200]);
    expect([out.thumbWidth, out.thumbHeight]).toEqual([480, 360]);
  });

  it("applies the EXIF orientation and strips all metadata", async () => {
    const out = await processImage(await jpeg(800, 400, true));
    // orientation 6 = rotated 90°: the stored image is portrait
    expect([out.width, out.height]).toEqual([400, 800]);
    const meta = await sharp(out.display).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("does not enlarge small photos", async () => {
    const out = await processImage(await jpeg(400, 320));
    expect([out.width, out.height]).toEqual([400, 320]);
  });

  it("rejects non-images, tiny images and corrupt files with a user-facing message", async () => {
    await expect(processImage(Buffer.from("<svg></svg>"))).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    await expect(processImage(await jpeg(300, 200))).rejects.toMatchObject({ code: "TOO_SMALL" });
    const truncated = (await jpeg(800, 600)).subarray(0, 200);
    await expect(processImage(truncated)).rejects.toBeInstanceOf(MediaError);
  });
});

describe("mediaUrl", () => {
  it("builds the public bucket URL for generated paths only", () => {
    const id = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
    expect(mediaUrl("https://x.supabase.co/", `${id}/thumb.webp`)).toBe(
      `https://x.supabase.co/storage/v1/object/public/public-media/${id}/thumb.webp`,
    );
    expect(() => mediaUrl("https://x.supabase.co", "../../secret")).toThrow();
    expect(() => mediaUrl("https://x.supabase.co", `${id}/display.png`)).toThrow();
  });
});

describe("isSameOrigin", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api/media", { method: "POST", headers });
  it("accepts same-origin requests and refuses cross-site or origin-less ones", () => {
    expect(isSameOrigin(req({ origin: "https://shop.example.com", host: "shop.example.com" }))).toBe(true);
    expect(
      isSameOrigin(
        req({ origin: "https://shop.example.com", host: "127.0.0.1:3000", "x-forwarded-host": "shop.example.com" }),
      ),
    ).toBe(true);
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "shop.example.com" }))).toBe(false);
    expect(isSameOrigin(req({ host: "shop.example.com" }))).toBe(false);
    expect(
      isSameOrigin(
        req({ origin: "https://shop.example.com", host: "shop.example.com", "sec-fetch-site": "cross-site" }),
      ),
    ).toBe(false);
  });
});
