import Image from "next/image";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { mediaSrc, type Media } from "@/modules/core/media";

/**
 * Renders CMS Markdown safely (TD-12): raw HTML in the source is dropped (skipHtml), the result is sanitised
 * (rehype-sanitize), only a small set of elements is allowed, and links may only point to internal paths, https/http
 * or mailto. Images (TD-77) may only be written as `![alt](media:<id>)` and are shown only when that id is one of the
 * document's own uploaded images (`images`); anything else — external URLs, other documents' images, removed images —
 * renders as nothing.
 */
const ALLOWED = [
  "p",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "blockquote",
  "code",
  "pre",
  "hr",
  "br",
  "img",
];

const MEDIA_REF = /^media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** GitHub schema, but images may only use the `media:` scheme and carry nothing except src and alt. */
const schema = {
  ...defaultSchema,
  attributes: { ...defaultSchema.attributes, img: ["src", "alt"] },
  protocols: { ...defaultSchema.protocols, src: ["media"] },
};

export function safeHref(url: string): string {
  const u = url.trim();
  if (/^\/(?!\/)[^\s]*$/.test(u)) return u; // internal path (not protocol-relative)
  if (/^#[\w-]+$/.test(u)) return u;
  if (/^(https?:\/\/|mailto:)[^\s]+$/i.test(u)) return u;
  return "";
}

/** Keeps `media:<id>` image sources for the image component; every other URL goes through safeHref. */
function transformUrl(url: string, key: string) {
  if (key === "src") return MEDIA_REF.test(url.trim()) ? url.trim() : "";
  return safeHref(url);
}

const components: Components = {
  h2: ({ children }) => <h2 className="mt-10 text-3xl">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-2xl">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-6 text-lg font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mt-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-rule text-ink-muted mt-4 border-l-4 pl-4">{children}</blockquote>
  ),
  code: ({ children }) => <code className="bg-secondary rounded px-1 font-mono text-sm">{children}</code>,
  pre: ({ children }) => (
    <pre className="bg-secondary relative mt-4 overflow-x-auto rounded p-4 text-sm">{children}</pre>
  ),
  hr: () => <hr className="border-rule mt-8" />,
  a: ({ href, children }) => {
    const target = safeHref(href ?? "");
    if (!target) return <span>{children}</span>;
    if (target.startsWith("/") || target.startsWith("#")) {
      return (
        <Link href={target} className="underline underline-offset-4">
          {children}
        </Link>
      );
    }
    return (
      <a href={target} rel="nofollow noopener noreferrer" className="underline underline-offset-4">
        {children}
      </a>
    );
  },
};

function imageComponent(images: Record<string, Media>): Components["img"] {
  return function BodyImage({ src }) {
    const id = typeof src === "string" ? MEDIA_REF.exec(src)?.[1] : undefined;
    const media = id ? images[id] : undefined;
    if (!media) return null;
    // The stored alt text (required at upload) is used, so every image has a reviewed description.
    return (
      <Image
        src={mediaSrc(media.display.path)}
        alt={media.alt}
        width={media.display.width}
        height={media.display.height}
        unoptimized
        sizes="(min-width: 768px) 48rem, 100vw"
        className="bg-ink/5 my-2 block h-auto w-full"
      />
    );
  };
}

export function Markdown({
  source,
  className,
  images = {},
}: {
  source: string;
  className?: string;
  /** The document's own ACTIVE images, keyed by media id. */
  images?: Record<string, Media>;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={transformUrl}
        components={{ ...components, img: imageComponent(images) }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
