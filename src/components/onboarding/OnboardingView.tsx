"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { DisputeArt, DraftArt, QueueArt } from "./art";
import { AuthHeader, SplitLayout, Spinner, useEnterGuest } from "./primitives";

/**
 * TASK-39: the 3-step product intro. The step lives in `?step=1..3` (pushed,
 * not replaced) so browser back/forward and refresh land on the same step.
 * Skip and Get started both enter guest mode and go Home.
 */
const STEPS = [
  {
    title: "Prioritise collections.",
    body: "See overdue invoices, identify high-risk accounts and focus on what matters most.",
    Art: QueueArt,
  },
  {
    title: "Understand the context.",
    body: "Get a complete view of disputes, payment claims and missing information before you act.",
    Art: DisputeArt,
  },
  {
    title: "Prepare with confidence.",
    body: "Generate personalised reminders with source-backed information and human approval before sending.",
    Art: DraftArt,
  },
] as const;

export function parseStep(raw: string | null): 1 | 2 | 3 {
  const n = Number(raw);
  return n === 2 || n === 3 ? n : 1;
}

export function OnboardingView() {
  const params = useSearchParams();
  const router = useRouter();
  const step = parseStep(params.get("step"));
  const { enter, pending } = useEnterGuest();
  const { title, body, Art } = STEPS[step - 1] ?? STEPS[0];
  const last = step === STEPS.length;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new heading on step change (not on first load), so
  // keyboard and screen-reader users hear the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const go = (n: number) => router.push(`/onboarding?step=${n}`, { scroll: false });

  return (
    <SplitLayout art={<Art key={step} />} artLabel={`Step ${step} illustration`}>
      <AuthHeader>
        <button
          type="button"
          onClick={enter}
          disabled={pending}
          className="rounded-md px-2 py-1.5 text-sm font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
        >
          Skip
        </button>
      </AuthHeader>

      <div className="flex flex-1 flex-col justify-center py-10 lg:py-16">
        <div className="w-full max-w-[460px]">
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Tour progress"
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={step}
              aria-valuetext={`Step ${step} of ${STEPS.length}`}
              className="flex gap-1.5"
            >
              {STEPS.map((_, k) => (
                <span
                  key={k}
                  className={cn("h-1.5 rounded-full transition-all duration-300", k + 1 === step ? "w-8 bg-brand" : k + 1 < step ? "w-4 bg-brand/50" : "w-4 bg-border-strong")}
                />
              ))}
            </div>
            <p className="text-xs font-semibold tracking-[0.12em] text-text-muted">
              STEP {step} OF {STEPS.length}
            </p>
          </div>

          <div key={step} className="ob-slide">
            <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-[2.25rem] leading-[1.08] font-semibold tracking-tight text-text focus:outline-none sm:text-[3rem]">
              {title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-text-muted sm:text-[17px]">{body}</p>
            {last && (
              <p className="mt-4 rounded-[var(--r-md)] border border-border bg-mint-pale px-3.5 py-2.5 text-sm text-text">
                Nothing is ever sent to a customer without a person approving it first.
              </p>
            )}
          </div>

          <div className="mt-10 flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => go(step - 1)}
                className="inline-flex min-h-12 items-center gap-2 rounded-[var(--r-md)] border border-border-strong bg-surface px-5 text-sm font-semibold text-text hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={last ? enter : () => go(step + 1)}
              disabled={pending}
              aria-busy={pending}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--r-md)] bg-brand px-6 text-sm font-semibold text-on-brand shadow-sm hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-80 sm:flex-none"
            >
              {pending ? <Spinner /> : null}
              {last ? (pending ? "Loading demo workspace…" : "Get started") : "Next"}
              {!pending && <ArrowRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </SplitLayout>
  );
}
