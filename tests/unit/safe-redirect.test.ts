import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath (open-redirect protection)", () => {
  it.each([
    ["/account", "/account"],
    ["/account/sessions?notice=revoked", "/account/sessions?notice=revoked"],
    ["/admin#x", "/admin#x"],
  ])("allows same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/foo\nSet-Cookie:x",
    "/%0d%0a",
    "",
    "account",
    "x".repeat(600),
  ])("rejects %j", (input) => {
    const out = safeNextPath(input, "/fallback");
    expect(out === "/fallback" || (out.startsWith("/") && !out.startsWith("//"))).toBe(true);
    expect(out).not.toContain("evil");
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath(["/x"])).toBe("/account");
  });
});
