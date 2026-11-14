import { describe, expect, it } from "vitest";
import { pathOnly, redact } from "@/lib/redact";

describe("redact", () => {
  it("masks e-mail addresses", () => {
    expect(redact("user jane.doe+x@example.com not found")).toBe("user [email] not found");
  });

  it("masks JWTs, bearer tokens and long random tokens", () => {
    expect(redact("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123 expired")).toBe("token [jwt] expired");
    expect(redact("Authorization: Bearer sk_live_abcdef")).toBe("Authorization: Bearer [token]");
    expect(redact("key a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8 rejected")).toBe("key [token] rejected");
  });

  it("masks phone, card and account-like numbers", () => {
    expect(redact("call +91 98765 43210 now")).toBe("call [number] now");
    expect(redact("card 4111 1111 1111 1111")).toBe("card [number]");
  });

  it("keeps short codes, uuids and ordinary words", () => {
    const uuid = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
    expect(redact(`PGRST116: row ${uuid} not found (HTTP 404)`)).toBe(`PGRST116: row ${uuid} not found (HTTP 404)`);
  });

  it("truncates long messages", () => {
    expect(redact("x ".repeat(400), 20)).toHaveLength(21);
  });
});

describe("pathOnly", () => {
  it("drops query strings and fragments", () => {
    expect(pathOnly("/reset-password?token=abc&email=a@b.co")).toBe("/reset-password");
    expect(pathOnly("/blog/post#comments")).toBe("/blog/post");
    expect(pathOnly("/admin")).toBe("/admin");
  });
});
