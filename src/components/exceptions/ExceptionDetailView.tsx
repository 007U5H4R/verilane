"use client";

import { Component, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { DbContext, useCan, useException, useExecute, type ExceptionDetail } from "@/store/hooks";
import { ExceptionDetailContent, ExceptionDetailError, ExceptionDetailSkeleton } from "./ExceptionDetailParts";

/**
 * `/exceptions/[id]` (TKT-75.02): one exception with payment evidence,
 * candidate invoice facts, the audit trail and the action bar. Allocation
 * goes through the one command path (`execute` → `allocate_payment`, a
 * single rw transaction). No `generateStaticParams`: exception ids exist
 * only in the browser's IndexedDB, so the id is read with `useParams()`
 * inside `<Suspense>` (the dispute-detail pattern).
 */
export function ExceptionDetailView() {
  const { id: raw } = useParams<{ id: string }>();
  const id = safeDecode(raw);
  const db = useContext(DbContext);
  const params = useSearchParams();
  // E2E-only state override (TP7): a normal build inlines `false` here.
  const forced = process.env.NEXT_PUBLIC_E2E === "1" ? params.get("__state") : null;
  const [attempt, setAttempt] = useState(0);

  if (forced === "loading") return <ExceptionDetailSkeleton />;
  if (forced === "empty") return <Wrap><NotFound /></Wrap>;
  if (forced === "error" || !db) {
    return (
      <Wrap>
        <ExceptionDetailError onRetry={() => window.location.reload()} />
      </Wrap>
    );
  }
  return (
    <Wrap>
      <DetailBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <ExceptionBody id={id} />
      </DetailBoundary>
    </Wrap>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function Wrap({ children }: { children: ReactNode }) {
  return <div className="min-w-0 p-4 sm:p-7">{children}</div>;
}

function NotFound() {
  return (
    <div data-state="not-found" className="flex flex-col gap-2">
      <p className="text-text">Exception not found.</p>
      <Link href="/exceptions" className="text-sm text-brand-strong underline">
        ← Back to exceptions
      </Link>
    </div>
  );
}

function ExceptionBody({ id }: { id: string }) {
  const detail = useException(id);
  if (detail === undefined) return <ExceptionDetailSkeleton />;
  if (detail === null) return <NotFound />;
  return <LoadedException detail={detail} />;
}

function LoadedException({ detail }: { detail: ExceptionDetail }) {
  const x = detail.exception;
  const only = detail.candidates.length === 1 ? detail.candidates[0]!.invoice.invoice_id : null;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? only;
  const [busy, setBusy] = useState(false);
  const execute = useExecute();
  const permission = useCan("allocate_payment", { kind: "review", id: x.review_id, requires_role: x.requires_role });

  async function submit() {
    if (selected === null) return;
    setBusy(true);
    try {
      const event = await execute({
        type: "allocate_payment",
        subject: { kind: "review", id: x.review_id },
        payload: { invoice_id: selected },
      });
      toast.success(String(event.summary ?? "Payment allocated."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t allocate this payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExceptionDetailContent
      detail={detail}
      selected={selected}
      onSelect={setPicked}
      permission={permission}
      busy={busy}
      onSubmit={() => void submit()}
    />
  );
}

class DetailBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] exception detail failed to load", error);
  }
  render() {
    return this.state.failed ? <ExceptionDetailError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
