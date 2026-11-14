import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

/**
 * Renders CMS Markdown safely (TD-12): raw HTML in the source is dropped (skipHtml), the result is sanitised
 * (rehype-sanitize, GitHub schema), only a small set of elements is allowed, and links may only point to internal
 * paths, https/http or mailto. Images are not allowed until the media pipeline exists.
 */
const ALLOWED = ["p", "h2", "h3", "h4", "ul", "ol", "li", "a", "strong", "em", "blockquote", "code", "pre", "hr", "br"];

export function safeHref(url: string): string {
  const u = url.trim();
  if (/^\/(?!\/)[^\s]*$/.test(u)) return u; // internal path (not protocol-relative)
  if (/^#[\w-]+$/.test(u)) return u;
  if (/^(https?:\/\/|mailto:)[^\s]+$/i.test(u)) return u;
  return "";
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
  pre: ({ children }) => <pre className="bg-secondary mt-4 overflow-x-auto rounded p-4 text-sm">{children}</pre>,
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

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        rehypePlugins={[rehypeSanitize]}
        urlTransform={(url) => safeHref(url)}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
