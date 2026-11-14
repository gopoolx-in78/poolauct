import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { Markdown, safeHref } = await import("@/components/cms/markdown");
const render = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe("CMS Markdown (XSS)", () => {
  it("allows internal, http(s) and mailto links only", () => {
    expect(safeHref("/poolx")).toBe("/poolx");
    expect(safeHref("#faq")).toBe("#faq");
    expect(safeHref("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHref("mailto:help@example.com")).toBe("mailto:help@example.com");
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,x",
      "//evil.example",
      "vbscript:x",
    ]) {
      expect(safeHref(bad), bad).toBe("");
    }
  });

  it("drops raw HTML and script", () => {
    const html = render('Hello <script>alert(1)</script> <img src=x onerror="alert(2)"> <b onclick="x()">bold</b>');
    expect(html).not.toMatch(/<script|<img|onerror|onclick|<b[ >]/i);
    expect(html).toContain("Hello");
  });

  it("neutralises dangerous links and images", () => {
    const html = render("[click](javascript:alert(1)) and ![x](https://example.com/a.png)");
    expect(html).not.toMatch(/javascript:|<img/i);
    expect(html).toContain("click");
  });

  it("renders safe Markdown with rel on external links", () => {
    const html = render("## Title\n\n**bold** [pools](/poolx) [site](https://example.com)");
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="/poolx"');
    expect(html).toMatch(/href="https:\/\/example.com" rel="nofollow noopener noreferrer"/);
  });

  it("never renders a second h1", () => {
    expect(render("# Big title")).not.toContain("<h1");
  });
});

describe("CMS Markdown images (TD-77)", () => {
  const id = "c2000000-0000-4000-8000-000000000001";
  const other = "c2000000-0000-4000-8000-000000000002";
  const images = {
    [id]: {
      id,
      alt: "Members unpacking a pooled delivery",
      display: { path: `${id}/display.webp`, width: 1600, height: 900 },
      thumb: { path: `${id}/thumb.webp`, width: 480, height: 270 },
    },
  };
  const withImages = (source: string) => renderToStaticMarkup(createElement(Markdown, { source, images }));

  it("shows the document's own image with its stored size and alt text", () => {
    const html = withImages(`Intro\n\n![typed alt](media:${id})`);
    expect(html).toMatch(/<img[^>]+alt="Members unpacking a pooled delivery"/);
    expect(html).toMatch(new RegExp(`src="[^"]*/storage/v1/object/public/public-media/${id}/display\\.webp"`));
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="900"');
    expect(html).not.toContain("typed alt");
  });

  it("drops unknown, external, relative, data and script image sources", () => {
    for (const src of [
      `media:${other}`,
      "https://tracker.example/pixel.png",
      "//evil.example/a.png",
      "a.png",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      `media:${id}?x=1`,
    ]) {
      const html = withImages(`![x](${src})`);
      expect(html, src).not.toMatch(/<img/i);
    }
  });

  it("shows nothing without the document's image list", () => {
    expect(render(`![x](media:${id})`)).not.toMatch(/<img/i);
  });
});
