import { notFound } from "next/navigation";

import { E2EHarness } from "@/components/E2EHarness";

/**
 * E2E-only page (TASK-14): hosts ActivityLog and a manager-only control until
 * their real homes (Investigation, TASK-7.9; Drafts, TASK-15) exist. 404s in
 * every non-E2E build.
 */
export default function E2EHarnessPage() {
  if (process.env.NEXT_PUBLIC_E2E !== "1") notFound();
  return <E2EHarness />;
}
