import { describe, expect, it } from "vitest";

import {
  PASSWORD_RULES,
  validateEmail,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
} from "./auth-validation";

describe("validateEmail", () => {
  it("requires a value", () => {
    expect(validateEmail("  ")).toBe("Enter your work email.");
  });
  it("rejects malformed addresses", () => {
    expect(validateEmail("priya@")).toMatch(/name@company/);
    expect(validateEmail("priya example.com")).toMatch(/name@company/);
  });
  it("accepts a well-formed address, ignoring surrounding space", () => {
    expect(validateEmail(" priya@aravalli.test ")).toBeNull();
  });
});

describe("validateNewPassword", () => {
  it("requires a value", () => {
    expect(validateNewPassword("")).toBe("Create a password.");
  });
  it("fails when any hint is unmet", () => {
    expect(validateNewPassword("abcdefgh")).not.toBeNull();
    expect(validateNewPassword("12345678")).not.toBeNull();
    expect(validateNewPassword("abc123")).not.toBeNull();
  });
  it("passes when every hint is met", () => {
    expect(validateNewPassword("ledger2026")).toBeNull();
    expect(PASSWORD_RULES.every((r) => r.test("ledger2026"))).toBe(true);
  });
});

describe("form validators", () => {
  it("sign in reports each missing field and nothing when valid", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({
      email: "Enter your work email.",
      password: "Enter your password.",
    });
    expect(validateSignIn({ email: "a@b.co", password: "x" })).toEqual({});
  });
  it("sign up checks name, email and password", () => {
    expect(Object.keys(validateSignUp({ name: "", email: "x", password: "short" })).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
    expect(validateSignUp({ name: "Priya Nair", email: "priya@aravalli.test", password: "ledger2026" })).toEqual({});
  });
});
