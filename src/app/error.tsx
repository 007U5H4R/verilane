"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// CR-005: the root error boundary. Any uncaught render error below the root
// layout lands here (inside the app shell, so the nav still works) instead
// of Next's default error page. The message stays generic: error text can
// carry internals, so it goes to the console only.
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 p-4 sm:p-6 lg:p-7" role="alert">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
        Something went wrong
      </h1>
      <p className="max-w-prose text-text-muted">
        This page hit an unexpected error. Your data is stored on this device and is unchanged.
      </p>
      <div className="flex items-center gap-3">
        <Button variant="outline" className="max-md:min-h-11" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild className="max-md:min-h-11">
          <Link href="/">Go to Home</Link>
        </Button>
      </div>
    </div>
  );
}
