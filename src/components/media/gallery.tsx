import Image from "next/image";
import { mediaSrc, type Media } from "@/modules/core/media";

/**
 * Listing photo gallery (TD-74). The first photo is shown large (it is usually the page's largest element, so it loads
 * eagerly with high priority); the rest are thumbnails that open the full-size photo. Renders nothing without photos.
 */
export function Gallery({ items, title }: { items: Media[]; title: string }) {
  const [first, ...rest] = items;
  if (!first) return null;
  return (
    <section aria-label={`Photos of ${title}`} className="mt-6">
      <a href={mediaSrc(first.display.path)} className="block">
        <Image
          src={mediaSrc(first.display.path)}
          alt={first.alt}
          width={first.display.width}
          height={first.display.height}
          unoptimized
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="bg-ink/5 border-rule aspect-[4/3] w-full border object-contain"
        />
        <span className="sr-only"> (open full-size photo)</span>
      </a>
      {rest.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rest.map((m) => (
            <li key={m.id}>
              <a href={mediaSrc(m.display.path)} className="block">
                <Image
                  src={mediaSrc(m.thumb.path)}
                  alt={m.alt}
                  width={m.thumb.width}
                  height={m.thumb.height}
                  unoptimized
                  className="bg-ink/5 border-rule aspect-[4/3] w-full border object-cover"
                />
                <span className="sr-only"> (open full-size photo)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Card cover: the first photo's thumbnail, lazy-loaded. */
export function CoverImage({ media }: { media: Media }) {
  return (
    <Image
      src={mediaSrc(media.thumb.path)}
      alt={media.alt}
      width={media.thumb.width}
      height={media.thumb.height}
      unoptimized
      className="bg-ink/5 -mx-5 -mt-5 mb-4 aspect-[4/3] w-[calc(100%+2.5rem)] max-w-none object-cover"
    />
  );
}
