import type { Metadata } from "next";

import { SignInForm } from "@/components/onboarding/AuthForms";

export const metadata: Metadata = { title: "Sign in — Verilane" };

export default function SignInPage() {
  return <SignInForm />;
}
