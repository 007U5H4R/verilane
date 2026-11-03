import type { Metadata } from "next";

import { SignUpForm } from "@/components/onboarding/AuthForms";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <SignUpForm />;
}
