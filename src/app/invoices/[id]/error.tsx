"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Investigation error state (Design.md §17): "Couldn't load INV-…" + back to invoices. */
export default function InvestigationError({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id ? decodeURIComponent(params.id) : "this invoice";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-7" role="alert">
      <h1 className="font-display text-2xl font-semibold text-text">
        Couldn&apos;t load <span className="font-mono">{invoiceId}</span>
      </h1>
      <p className="mt-2 text-text-muted">The local data store didn&apos;t respond.</p>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="outline" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/invoices" className="text-sm text-brand hover:underline">
          ← Back to invoices
        </Link>
      </div>
    </div>
  );
}
