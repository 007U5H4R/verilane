import { ErrorState } from "@/components/states/ErrorState";
import { formatInr, paise } from "@/domain/money";
import { NSM_HEADING, NSM_LABEL, type NsmResult } from "@/domain/nsm";

const BAR = "animate-pulse rounded bg-surface-sunken motion-reduce:animate-none";

/**
 * Home's North Star Metric section (TKT-75.07, Design §6 + A1 item 4,
 * EXE172): a brand-tint panel above the task feed. The R8 "Simulated" label
 * sits beside the figure in every state (TC-75.43). Presentational only —
 * `result` is computed by `computeNsm` inside the caller's error boundary.
 *
 * States: loading (`result` undefined), empty (nothing resolved yet), error
 * (the caller's boundary caught a failure), working; offline adds a note,
 * since the figure is computed from this device's local data.
 */
export function NsmSection({
  result,
  online,
  error = false,
  onRetry,
}: {
  result: NsmResult | undefined;
  online: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const state = error ? "error" : result === undefined ? "loading" : result.resolvedCount === 0 ? "empty" : "working";

  return (
    <section
      data-testid="home-nsm"
      data-nsm-state={state}
      aria-labelledby="home-nsm-title"
      aria-busy={state === "loading" ? true : undefined}
      className="flex min-w-0 flex-col gap-1 rounded-[10px] border-l-4 border-brand bg-brand-tint p-4 break-words"
    >
      <h2 id="home-nsm-title" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {NSM_HEADING}
      </h2>
      {state === "error" ? (
        <ErrorState message="Couldn’t compute the North Star Metric." onRetry={onRetry ?? (() => undefined)} />
      ) : state === "loading" ? (
        <span className={`my-1 h-7 w-40 max-w-full ${BAR}`} aria-hidden="true" />
      ) : (
        <p data-testid="home-nsm-value" className="font-display text-[24px] font-semibold leading-tight text-brand">
          {formatInr(paise(result?.valuePaise ?? 0))}
        </p>
      )}
      <p data-testid="home-nsm-label" className="text-[13px] text-text-muted">
        {NSM_LABEL}. Value of payment exceptions resolved by an approved action and not reversed.
      </p>
      {state === "working" && result ? (
        <p className="text-[13px] text-text-muted">
          {result.resolvedCount} {result.resolvedCount === 1 ? "exception" : "exceptions"} resolved this session
        </p>
      ) : null}
      {state === "empty" ? <p className="text-[13px] text-text-muted">No exceptions resolved yet this session.</p> : null}
      {!online && state !== "error" ? (
        <p data-testid="home-nsm-offline" className="text-[13px] text-text-muted">
          Offline — computed from this device’s data.
        </p>
      ) : null}
    </section>
  );
}
