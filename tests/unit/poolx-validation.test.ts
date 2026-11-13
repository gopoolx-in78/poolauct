import { describe, expect, it } from "vitest";
import { adminPoolSchema, istDateTime, poolRequestSchema, rupeesToPaise } from "@/modules/poolx/validation";

describe("PoolX validation", () => {
  it("parses rupee amounts into paise without floating point", () => {
    expect(rupeesToPaise.parse("1,250")).toBe(125000n);
    expect(rupeesToPaise.parse("1250.5")).toBe(125050n);
    expect(rupeesToPaise.parse("0.01")).toBe(1n);
    expect(rupeesToPaise.parse("")).toBeNull();
    expect(rupeesToPaise.safeParse("12.345").success).toBe(false);
    expect(rupeesToPaise.safeParse("-5").success).toBe(false);
    expect(rupeesToPaise.safeParse("1e5").success).toBe(false);
  });

  it("interprets datetime-local values as IST", () => {
    expect(istDateTime.parse("2026-11-20T18:00")).toBe("2026-11-20T12:30:00.000Z");
    expect(istDateTime.safeParse("tomorrow").success).toBe(false);
  });

  const pool = {
    slug: "steel-bars-pune",
    title: "Steel bars",
    summary: "TMT bars for Pune builders",
    description: "",
    productName: "TMT bar",
    specs: "Grade: Fe 500D\nLength: 12 m",
    categorySlug: "cement-and-steel",
    sellerId: "",
    unitLabel: "tonne",
    basePrice: "62000",
    referencePrice: "",
    referenceSource: "",
    tierBasis: "QUANTITY",
    minQty: "1",
    maxQty: "20",
    minMembers: "3",
    targetMembers: "10",
    maxMembers: "",
    platformFeePercent: "1.5",
    withdrawalPolicy: "Withdraw any time while the pool is open.",
    terms: "",
    deliveryNote: "",
    startsAt: "2026-11-20T10:00",
    deadlineAt: "2026-12-01T18:00",
  };

  it("accepts a valid pool and converts units", () => {
    const r = adminPoolSchema.parse(pool);
    expect(r.basePrice).toBe(6200000n);
    expect(r.platformFeePercent).toBe(150);
    expect(r.specs).toEqual([
      { label: "Grade", value: "Fe 500D" },
      { label: "Length", value: "12 m" },
    ]);
  });

  it("enforces cross-field rules", () => {
    const issues = (o: object) => {
      const r = adminPoolSchema.safeParse({ ...pool, ...o });
      return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    };
    expect(issues({ maxQty: "0" })).toContain("maxQty");
    expect(issues({ targetMembers: "2" })).toContain("targetMembers");
    expect(issues({ referencePrice: "70000" })).toContain("referenceSource");
    expect(issues({ deadlineAt: "2026-11-01T10:00" })).toContain("deadlineAt");
    expect(issues({ specs: "no colon here" })).toContain("specs");
    expect(issues({ slug: "Bad Slug" })).toContain("slug");
    expect(issues({ platformFeePercent: "1.555" })).toContain("platformFeePercent");
  });

  it("validates pool requests", () => {
    const base = {
      title: "Office laptops",
      product: "Laptop",
      description: "Twenty laptops for our team",
      category: "",
      estimatedQuantity: "20",
      targetParticipants: "",
      expectedUnitPrice: "55,000",
      specifications: "",
      preferredSeller: "",
      deliveryLocation: "Bengaluru 560001",
      neededBy: "",
    };
    const r = poolRequestSchema.parse(base);
    expect(r.estimatedQuantity).toBe(20);
    expect(r.expectedUnitPrice).toBe(5500000n);
    expect(poolRequestSchema.safeParse({ ...base, deliveryLocation: "" }).success).toBe(false);
    expect(poolRequestSchema.safeParse({ ...base, estimatedQuantity: "2.5" }).success).toBe(false);
  });
});
