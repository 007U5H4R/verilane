import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// TASK-49 DES-010: the branded 404. It renders inside the root layout, so a
// guest gets the app shell around it and the nav still works. `absolute`:
// the root template only applies to child segments, not this one.
export const metadata: Metadata = { title: { absolute: "Page not found — Verilane" } };

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 p-4 sm:p-6 lg:p-7">
      <p className="text-[13px] font-medium text-text-muted">404</p>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
        Page not found
      </h1>
      <p className="max-w-prose text-text-muted">
        This page doesn&apos;t exist or has moved.
      </p>
      <Button asChild className="max-md:min-h-11">
        <Link href="/">Go to Home</Link>
      </Button>
    </div>
  );
}
