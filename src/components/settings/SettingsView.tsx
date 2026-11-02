"use client";

import Link from "next/link";
import { useContext, type ReactNode } from "react";

import { ErrorState } from "@/components/states/ErrorState";
import { DbContext } from "@/store/hooks";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { AsOfControl } from "./AsOfControl";
import { DataOps } from "./DataOps";
import { ImportDialog } from "./ImportDialog";
import { PriorityWeights } from "./PriorityWeights";
import { ResetDialog } from "./ResetDialog";
import { ThemeControl } from "./ThemeControl";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-6 flex-col gap-3 rounded-lg border border-border bg-surface shadow-card p-5"
    >
      <h2 id={`${id}-title`} className="font-semibold text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** TASK-24.5: the Settings entry point for installing the PWA, sharing the
 * captured `beforeinstallprompt` event with the header chip. */
function InstallSection() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  if (installed) {
    return <p className="text-[13px] text-text-muted">Verilane is installed on this device.</p>;
  }
  if (!canInstall) {
    return (
      <p className="text-[13px] text-text-muted">
        Not installable right now — your browser didn’t offer an install prompt for this page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-text-muted">Install Verilane for offline access and a standalone window.</p>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={promptInstall}>
          Install app
        </Button>
      </div>
    </div>
  );
}

/** Settings (TASK-19): data operations, as-of override, weights, theme, eval. */
export function SettingsView() {
  const db = useContext(DbContext);
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-7">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">Settings</h1>
        <p className="text-text-muted">Everything here applies to this browser only.</p>
      </header>
      {db ? (
        <>
          <Section id="import" title="Import data">
            <ImportDialog db={db} />
          </Section>
          <Section id="export" title="Export data">
            <DataOps db={db} />
          </Section>
          <Section id="reset" title="Reset demo data">
            <p className="text-[13px] text-text-muted">
              Start over from the shipped demo set. Notes, drafts, disputes and the audit log are cleared.
            </p>
            <div>
              <ResetDialog />
            </div>
          </Section>
          <Section id="as-of" title="As-of date">
            <AsOfControl db={db} />
          </Section>
        </>
      ) : (
        <ErrorState message="Couldn’t open this browser’s data, so data settings are unavailable." onRetry={() => window.location.reload()} />
      )}
      <Section id="priority" title="Priority weights">
        <PriorityWeights />
      </Section>
      <Section id="theme" title="Theme">
        <ThemeControl />
      </Section>
      <Section id="install" title="Install app">
        <InstallSection />
      </Section>
      <Section id="eval" title="Evaluation">
        <p className="text-[13px] text-text-muted">How well extraction and matching score against the labelled demo set.</p>
        <Link href="/settings/eval" className="w-fit text-[13px] font-medium text-brand underline underline-offset-2">
          Open evaluation report
        </Link>
      </Section>
    </div>
  );
}
