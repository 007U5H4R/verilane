import type { Metadata } from "next";

import { WelcomeView } from "@/components/onboarding/WelcomeView";

export const metadata: Metadata = { title: "Welcome — Verilane" };

export default function WelcomePage() {
  return <WelcomeView />;
}
