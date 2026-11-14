/**
 * Reads every page of a paged list, up to `max` items. Used by the sitemap: the public list functions cap one page at 48
 * pools / auctions or 100 documents, so a single call would leave later listings out.
 */
export async function readAll<T>(
  page: (limit: number, offset: number) => Promise<{ total: number; items: T[] }>,
  pageSize: number,
  max: number,
): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; offset < max; offset += pageSize) {
    const { total, items: batch } = await page(pageSize, offset);
    items.push(...batch);
    if (batch.length < pageSize || items.length >= total) break;
  }
  return items.slice(0, max);
}
