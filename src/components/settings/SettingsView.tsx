"use client";

import {
  BarChart3,
  Bot,
  CalendarDays,
  Database,
  Download,
  MonitorSmartphone,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useContext } from "react";

import { ErrorState } from "@/components/states/ErrorState";
import { DbContext } from "@/store/hooks";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { AsOfControl } from "./AsOfControl";
import { DataOps } from "./DataOps";
import { ImportDialog } from "./ImportDialog";
import { PriorityWeights } from "./PriorityWeights";
import { ResetDialog } from "./ResetDialog";
import { SettingsCard, SettingsSubsection } from "./SettingsCard";
import { ThemeControl } from "./ThemeControl";

// TASK-41: loaded on demand so /settings stays inside the route budget.
const AutopilotControl = dynamic(() => import("./AutopilotControl").then((m) => m.AutopilotControl), {
  loading: () => <p className="text-[13px] text-text-muted">Loading autopilot policy…</p>,
});
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

/** Decorative header art: a settings panel with sliders, in theme tokens. */
function HeaderArt() {
  return (
    <svg aria-hidden viewBox="0 0 160 96" className="hidden h-20 w-auto shrink-0 sm:block" fill="none">
      <rect x="8" y="10" width="112" height="76" rx="10" className="fill-mint-pale stroke-border" strokeWidth="1.5" />
      <rect x="20" y="24" width="88" height="6" rx="3" className="fill-surface-sunken" />
      <rect x="20" y="24" width="54" height="6" rx="3" className="fill-brand" />
      <circle cx="74" cy="27" r="6" className="fill-surface stroke-brand" strokeWidth="2" />
      <rect x="20" y="45" width="88" height="6" rx="3" className="fill-surface-sunken" />
      <rect x="20" y="45" width="30" height="6" rx="3" className="fill-brand" />
      <circle cx="50" cy="48" r="6" className="fill-surface stroke-brand" strokeWidth="2" />
      <rect x="20" y="66" width="88" height="6" rx="3" className="fill-surface-sunken" />
      <rect x="20" y="66" width="70" height="6" rx="3" className="fill-brand" />
      <circle cx="90" cy="69" r="6" className="fill-surface stroke-brand" strokeWidth="2" />
      <circle cx="132" cy="40" r="20" className="fill-surface stroke-brand" strokeWidth="1.5" />
      <path d="M124 40l6 6 11-12" className="stroke-brand" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Settings (TASK-19, redesigned in TASK-38): data management and the read-only
 * priority weights side by side, the as-of date full width, then theme,
 * install and evaluation. The shell renders the breadcrumb above this.
 */
export function SettingsView() {
  const db = useContext(DbContext);
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
            Settings
          </h1>
          <p className="text-text-muted">Configure your workspace, data and scoring preferences.</p>
          <p className="text-[13px] text-text-muted">Everything here applies to this browser only.</p>
        </div>
        <HeaderArt />
      </header>

      <div className="grid gap-5 lg:grid-cols-[56fr_44fr] lg:items-start">
        {db ? (
          <SettingsCard
            id="data"
            title="Data management"
            description="Import, export or reset your workspace data."
            icon={Database}
          >
            <SettingsSubsection
              id="import"
              title="Import data"
              description="Upload a CSV file to add or replace records."
              icon={Upload}
            >
              <ImportDialog db={db} />
            </SettingsSubsection>
            <SettingsSubsection id="export" title="Export data" description="Download workspace data as CSV." icon={Download}>
              <DataOps db={db} />
            </SettingsSubsection>
            <SettingsSubsection
              id="reset"
              title="Reset demo data"
              description="Start over from the shipped demo set. Notes, drafts, disputes and the audit log are cleared."
              icon={RotateCcw}
              tone="warn"
              aside={<ResetDialog tone="danger" />}
            />
          </SettingsCard>
        ) : (
          <ErrorState
            message="Couldn’t open this browser’s data, so data settings are unavailable."
            onRetry={() => window.location.reload()}
          />
        )}
        <SettingsCard
          id="priority"
          title="Priority weights"
          description="How the queue ranks open invoices."
          icon={SlidersHorizontal}
          tone="info"
        >
          <PriorityWeights />
        </SettingsCard>
      </div>

      {db && (
        <SettingsCard
          id="as-of"
          title="As-of date"
          description="Set the reference date for ageing, overdue and queue ordering."
          icon={CalendarDays}
        >
          <AsOfControl db={db} />
        </SettingsCard>
      )}

      {db && (
        <SettingsCard
          id="autopilot"
          title="Copilot autopilot"
          description="Let Copilot send the lowest-risk reminders on its own (simulated)."
          icon={Bot}
        >
          <AutopilotControl db={db} />
        </SettingsCard>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <SettingsCard id="theme" title="Theme" description="Choose how Verilane looks in this browser." icon={Palette}>
          <ThemeControl />
        </SettingsCard>
        <SettingsCard id="install" title="Install app" description="Use Verilane like a desktop or phone app." icon={MonitorSmartphone}>
          <InstallSection />
        </SettingsCard>
        <SettingsCard
          id="eval"
          title="Evaluation"
          description="See how well extraction and matching score against the labelled demo set."
          icon={BarChart3}
          tone="info"
        >
          <Link
            href="/settings/eval"
            className="w-fit text-[13px] font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
          >
            Open evaluation report →
          </Link>
        </SettingsCard>
      </div>
    </div>
  );
}
