import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsView />;
}
