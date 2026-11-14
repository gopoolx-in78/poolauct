import { describe, expect, it } from "vitest";
import { readAll } from "@/lib/read-all";

const source = (n: number) => {
  const all = Array.from({ length: n }, (_, i) => i);
  const calls: number[] = [];
  const page = async (limit: number, offset: number) => {
    calls.push(offset);
    return { total: n, items: all.slice(offset, offset + limit) };
  };
  return { page, calls };
};

describe("readAll (sitemap paging)", () => {
  it("reads past the first page", async () => {
    const { page, calls } = source(65);
    expect(await readAll(page, 48, 5000)).toHaveLength(65);
    expect(calls).toEqual([0, 48]);
  });

  it("stops after one call when everything fits", async () => {
    const { page, calls } = source(10);
    expect(await readAll(page, 48, 5000)).toHaveLength(10);
    expect(calls).toEqual([0]);
  });

  it("stops on an exact multiple without an extra empty call", async () => {
    const { page, calls } = source(96);
    expect(await readAll(page, 48, 5000)).toHaveLength(96);
    expect(calls).toEqual([0, 48]);
  });

  it("caps at the maximum", async () => {
    const { page, calls } = source(500);
    expect(await readAll(page, 48, 100)).toHaveLength(100);
    expect(calls).toEqual([0, 48, 96]);
  });

  it("handles an empty list", async () => {
    const { page } = source(0);
    expect(await readAll(page, 48, 5000)).toEqual([]);
  });
});
