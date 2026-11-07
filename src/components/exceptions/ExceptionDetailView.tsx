"use client";

import { Component, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  DbContext,
  ensurePolicyEvaluated,
  policyInputsFor,
  useCan,
  useException,
  usePolicyDecision,
  useRole,
  type ExceptionDetail,
} from "@/store/hooks";
import type { ExecuteOutcome } from "@/domain/commands";
import { isPaymentExceptionKind } from "@/domain/schema";
import { runExecuteAgentFor } from "@/store/executeAgent";
import { submitAllocationGated } from "@/store/tx";
import { ExceptionDetailContent, ExceptionDetailError, ExceptionDetailSkeleton } from "./ExceptionDetailParts";
import { ReverseAllocationSection } from "./ReverseAllocationSection";

/**
 * `/exceptions/[id]` (TKT-75.02): one exception with payment evidence,
 * candidate invoice facts, the audit trail and the action bar. Allocation
 * goes through the one command path (`allocate_payment`, a single rw
 * transaction) — since TKT-75.04 via `submitAllocationGated`, which gates it
 * by the persisted Policy verdict and audits a refusal (FS21). No `generateStaticParams`: exception ids exist
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

/**
 * Stage 2's one trigger point (TKT-75.03/EXE130): evaluating Policy here,
 * on an actual page view, confines the side effect to the browser — never
 * `loader.ts`'s `recompute()`, which also runs during `ensureSeeded()` and
 * every store test's setup. It fires when there's no decision yet or the
 * latest one's `input_fingerprint` no longer matches the exception's current
 * inputs (fix r1 M2: e.g. a CSV import changed the amount — a stale
 * auto-permit must never stand). `attemptedFor` keys the one-shot on
 * `id|fingerprint`, so the live query's `null` between write and re-read
 * can't double-fire and a failed attempt isn't retried in a loop; a new
 * fingerprint is a new attempt. Failures surface as `policyError` (m2).
 */
function usePolicyEvaluationTrigger(id: string, detail: ExceptionDetail | undefined | null) {
  const db = useContext(DbContext);
  const policyDecision = usePolicyDecision(id);
  const attemptedFor = useRef<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; reason: string } | null>(null);

  const inputs = detail ? policyInputsFor(detail) : undefined;
  const fingerprint = inputs?.ok && inputs.value ? inputs.value.fingerprint : null;
  const key = fingerprint === null ? null : `${id}|${fingerprint}`;
  const stale = !!policyDecision && fingerprint !== null && policyDecision.input_fingerprint !== fingerprint;

  useEffect(() => {
    if (!db || !detail || key === null || policyDecision === undefined) return;
    if (policyDecision !== null && !stale) return;
    if (attemptedFor.current === key) return;
    attemptedFor.current = key;
    void ensurePolicyEvaluated(db, detail).then((result) => {
      if (result.ok) return;
      console.error("[verilane] policy evaluation failed", result.error.reason);
      setFailure({ key, reason: result.error.reason });
    });
  }, [db, detail, key, policyDecision, stale]);

  const policyError =
    inputs && !inputs.ok ? inputs.error.reason : failure !== null && failure.key === key ? failure.reason : null;
  return { policyDecision, policyError, policyStale: stale && policyError === null };
}

/**
 * Stage 3's trigger point (TKT-75.04, EXE180): once Policy has a CURRENT
 * persisted decision for an open payment exception, run the Execute agent.
 * It re-reads the decision inside its own transaction and acts only on
 * `auto_permitted`; other verdicts are handed off with no write. One-shot per
 * `id|decision|fingerprint`, like the Policy trigger, so a failure isn't
 * retried in a loop and the live query's re-renders can't double-fire.
 */
function useExecuteAgentTrigger(
  id: string,
  detail: ExceptionDetail | undefined | null,
  policy: ReturnType<typeof usePolicyEvaluationTrigger>,
) {
  const db = useContext(DbContext);
  const attemptedFor = useRef<string | null>(null);
  const [result, setResult] = useState<{ key: string; outcome?: ExecuteOutcome | null; error?: string } | null>(null);
  const decision = policy.policyDecision;
  const open = !!detail && detail.exception.status === "open" && isPaymentExceptionKind(detail.exception.kind);
  const key =
    open && decision && !policy.policyStale && policy.policyError === null
      ? `${id}|${decision.decision_id}|${decision.input_fingerprint ?? ""}`
      : null;

  useEffect(() => {
    if (!db || !detail || key === null || attemptedFor.current === key) return;
    attemptedFor.current = key;
    void runExecuteAgentFor(db, detail).then((r) => {
      if (!r.ok) {
        console.error("[verilane] execute agent failed", r.error.reason);
        setResult({ key, error: r.error.reason });
        return;
      }
      setResult({ key, outcome: r.value });
      if (r.value?.kind === "executed") toast.success(String(r.value.event.summary));
    });
  }, [db, detail, key]);

  const current = result !== null && result.key === key ? result : null;
  return { executeOutcome: current?.outcome, executeError: current?.error ?? null };
}

function ExceptionBody({ id }: { id: string }) {
  const detail = useException(id);
  const policy = usePolicyEvaluationTrigger(id, detail);
  const execute = useExecuteAgentTrigger(id, detail, policy);
  if (detail === undefined) return <ExceptionDetailSkeleton />;
  if (detail === null) return <NotFound />;
  return (
    <>
      <LoadedException detail={detail} policy={policy} execute={execute} />
      {/* TKT-75.06: its own section below the action bar, not part of it (EXE143). */}
      <ReverseAllocationSection detail={detail} />
    </>
  );
}

function LoadedException({
  detail,
  policy,
  execute,
}: {
  detail: ExceptionDetail;
  policy: ReturnType<typeof usePolicyEvaluationTrigger>;
  execute: ReturnType<typeof useExecuteAgentTrigger>;
}) {
  const x = detail.exception;
  const only = detail.candidates.length === 1 ? detail.candidates[0]!.invoice.invoice_id : null;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? only;
  const [busy, setBusy] = useState(false);
  const db = useContext(DbContext);
  const role = useRole();
  const permission = useCan("allocate_payment", { kind: "review", id: x.review_id, requires_role: x.requires_role });

  async function submit() {
    const inputs = policyInputsFor(detail);
    if (selected === null || !db || !inputs.ok || inputs.value === null) return;
    setBusy(true);
    try {
      const event = await submitAllocationGated(
        db,
        { type: "allocate_payment", subject: { kind: "review", id: x.review_id }, payload: { invoice_id: selected } },
        inputs.value.fingerprint,
      );
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
      policyDecision={policy.policyDecision}
      policyError={policy.policyError}
      policyStale={policy.policyStale}
      policyGate={{
        decision: policy.policyDecision,
        stale: policy.policyStale,
        error: policy.policyError,
        role,
        executeRefused: execute.executeOutcome?.kind === "refused",
      }}
      executeOutcome={execute.executeOutcome}
      executeError={execute.executeError}
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
