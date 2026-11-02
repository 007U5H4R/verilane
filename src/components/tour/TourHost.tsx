/**
 * TASK-44: the demo tour, loaded only once a tour is requested (AppShell's
 * TourGate). Owns the confirm dialog, the running spotlight + callout, and
 * the finished card. Guided prompts only: it never clicks or navigates for
 * the viewer, apart from going to /queue after the confirmed reset.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDb } from "@/store/hooks";
import { escOwnedByApp, useAppModalOpen } from "./appModal";
import { SpotlightRing, useTargetRect } from "./Spotlight";
import { confirmStartTour } from "./startTour";
import { TOUR_STEPS, currentStage, isStepComplete, type TourSnapshot } from "./steps";
import { TourCallout } from "./TourCallout";
import { backState, nextState, routeAdvance } from "./tourNav";
import { exitTour, requestTour, setTour, useTour, type TourState } from "./tourStore";
import { useTourSnapshot } from "./useTourSnapshot";

function useEscToExit() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An Esc the app owns (its dialog, menu or open search) never ends the tour.
      if (e.key === "Escape" && !escOwnedByApp(e)) exitTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function CenterCard({ children, labelledBy, role, testId }: { children: React.ReactNode; labelledBy: string; role: "alertdialog" | "dialog"; testId: string }) {
  return (
    <div data-tour-ui="" className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(8_20_15/0.55)] p-4">
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testId}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 text-text shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmStart() {
  const db = useDb();
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  useEscToExit();
  useEffect(() => start.current?.focus(), []);

  async function onStart() {
    setBusy(true);
    setFailed(false);
    try {
      await confirmStartTour(db);
      router.push("/queue");
    } catch (err) {
      console.error("[tour] reset failed", err);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <CenterCard role="alertdialog" labelledBy={id} testId="tour-confirm">
      <h2 id={id} className="text-base font-semibold">
        Start the demo?
      </h2>
      <p className="mt-2 text-sm text-text-muted">This resets the demo data to a fresh start.</p>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-text">
          The reset didn’t finish. Try again.
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={exitTour} disabled={busy}>
          Cancel
        </Button>
        <Button ref={start} onClick={onStart} disabled={busy}>
          {busy ? "Resetting…" : "Start demo"}
        </Button>
      </div>
    </CenterCard>
  );
}

function Finished() {
  const id = useId();
  const restart = useRef<HTMLButtonElement>(null);
  useEscToExit();
  useEffect(() => restart.current?.focus(), []);
  return (
    <CenterCard role="dialog" labelledBy={id} testId="tour-finished">
      <h2 id={id} className="text-base font-semibold">
        You’ve seen Verilane.
      </h2>
      <p className="mt-2 text-sm text-text-muted">
        Clarity and control over your receivables, without blindly trusting AI. Look around, or run the demo again.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={exitTour}>
          Explore on my own
        </Button>
        <Button ref={restart} onClick={requestTour}>
          Restart demo
        </Button>
      </div>
    </CenterCard>
  );
}

function Running({ t, snap }: { t: TourState; snap: TourSnapshot }) {
  const pathname = usePathname();
  const step = TOUR_STEPS[t.step];
  useEscToExit();

  // Auto-advance only on a false→true completion while on this step, so Back
  // to a finished action step doesn't bounce straight forward again.
  const complete = step ? isStepComplete(step, snap) : false;
  const seen = useRef<{ step: number; complete: boolean } | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { step: t.step, complete };
    if (!prev || prev.step !== t.step || prev.complete || !complete) return;
    setTour(t.step >= TOUR_STEPS.length - 1 ? { phase: "finished", step: t.step, substage: 0 } : { phase: "running", step: t.step + 1, substage: 0 });
  }, [t.step, complete]);

  // A look-only step advances when the viewer follows its prompt to the next page.
  useEffect(() => {
    const next = routeAdvance(t, pathname);
    if (next) setTour(next);
  }, [t, pathname]);

  const resolved = step ? currentStage(step, snap, pathname, t.substage) : null;
  const wrongPage = resolved?.kind === "wrong-page";
  const hint = resolved?.stage.navHint;
  const selector = wrongPage && hint ? hint.target : (resolved?.stage.target ?? "");
  const fallback = wrongPage && hint ? hint.mobileTarget : undefined;
  const rect = useTargetRect(selector, fallback);
  // An app modal (the approve confirm, the More sheet) owns the screen: step aside.
  const modal = useAppModalOpen();

  if (!step || !resolved || modal) return null;
  const prompt = wrongPage && hint ? `Open ${hint.label} to continue.` : resolved.stage.prompt;

  return (
    <>
      {rect && <SpotlightRing rect={rect} />}
      <TourCallout
        stepIndex={t.step}
        stepCount={TOUR_STEPS.length}
        title={step.title}
        pitch={step.pitch}
        prompt={prompt}
        rect={rect}
        focusKey={`${t.step}:${t.substage}`}
        isLast={t.step === TOUR_STEPS.length - 1}
        onNext={() => setTour(nextState(t, snap))}
        onBack={() => setTour(backState(t))}
        onSkip={exitTour}
      />
    </>
  );
}

export default function TourHost() {
  const t = useTour();
  const snap = useTourSnapshot();
  if (t.phase === "confirm") return <ConfirmStart />;
  if (t.phase === "finished") return <Finished />;
  if (t.phase === "running" && snap) return <Running t={t} snap={snap} />;
  return null;
}
