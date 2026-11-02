/**
 * TASK-39: client-side checks for the Sign in / Create account forms.
 * Verilane has no auth backend, so these are hints only — nothing is sent or
 * stored. Pure functions so they can be unit-tested without a DOM.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your work email.";
  if (!EMAIL_RE.test(v)) return "Enter an email like name@company.com.";
  return null;
}

export function validateName(value: string): string | null {
  return value.trim() ? null : "Enter your full name.";
}

/** Sign in only checks presence — strength rules belong to account creation. */
export function validateSignInPassword(value: string): string | null {
  return value ? null : "Enter your password.";
}

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "letter", label: "A letter", test: (v) => /[A-Za-z]/.test(v) },
  { id: "number", label: "A number", test: (v) => /\d/.test(v) },
];

export function validateNewPassword(value: string): string | null {
  if (!value) return "Create a password.";
  return PASSWORD_RULES.every((r) => r.test(value)) ? null : "Password doesn't meet the hints below.";
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateSignIn(v: { email: string; password: string }): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  const email = validateEmail(v.email);
  const password = validateSignInPassword(v.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}

export function validateSignUp(v: {
  name: string;
  email: string;
  password: string;
}): FieldErrors<"name" | "email" | "password"> {
  const errors: FieldErrors<"name" | "email" | "password"> = {};
  const name = validateName(v.name);
  const email = validateEmail(v.email);
  const password = validateNewPassword(v.password);
  if (name) errors.name = name;
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}
