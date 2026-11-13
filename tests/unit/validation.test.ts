import { describe, expect, it } from "vitest";
import { passwordSchema, profileSchema, signUpSchema, totpCodeSchema } from "@/modules/core/validation";

describe("auth validation", () => {
  it("enforces the configured password policy", () => {
    expect(passwordSchema.safeParse("Abcdefghi1").success).toBe(true);
    expect(passwordSchema.safeParse("short1A").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(passwordSchema.safeParse("ALLUPPERCASE1").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsHere").success).toBe(false);
  });

  const base = {
    displayName: "Asha",
    email: "  Asha@Example.COM ",
    password: "Abcdefghi1",
    confirmPassword: "Abcdefghi1",
    acceptTerms: "on",
  };

  it("normalises email and requires terms + matching passwords", () => {
    const ok = signUpSchema.safeParse(base);
    expect(ok.success && ok.data.email).toBe("asha@example.com");
    expect(signUpSchema.safeParse({ ...base, acceptTerms: undefined }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, confirmPassword: "Different1A" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, displayName: "   " }).success).toBe(false);
  });

  it("rejects markup in names and over-long profile fields", () => {
    expect(profileSchema.safeParse({ displayName: "<script>", city: "", state: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Asha", city: "x".repeat(81), state: "" }).success).toBe(false);
  });

  it("accepts only 6-digit TOTP codes", () => {
    expect(totpCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(totpCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "12345a" }).success).toBe(false);
  });
});
