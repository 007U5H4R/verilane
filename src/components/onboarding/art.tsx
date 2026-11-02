/**
 * TASK-39: onboarding illustrations.
 *
 * Each panel is a generated paper-cut illustration (kie.ai, Nano Banana 2;
 * WebP files in public/onboarding/, originals kept outside the repo) behind
 * real HTML product cards. The image is decorative; the cards and the
 * composition's text label carry the meaning. All names and amounts come
 * from the synthetic seed (src/domain seed) — fictional companies, INR.
 *
 * Each composition is one `role="img"` with a text label; its children are
 * decorative (aria-hidden) so screen readers hear one sentence, not a table.
 */
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { Check, FileText, Mail, Paperclip, ShieldCheck, Sparkles, TriangleAlert, UserCheck } from "lucide-react";

import { cn } from "@/lib/cn";

const i = (n: number) => ({ "--ob-i": n }) as CSSProperties;

/** The generated illustration, filling the art panel; dimmed in dark mode. */
function Backdrop({ src, position = "center", priority = false }: { src: string; position?: string; priority?: boolean }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      fill
      priority={priority}
      sizes="(min-width: 1024px) 50vw, 100vw"
      className="object-cover dark:brightness-[0.45] dark:saturate-[0.8]"
      style={{ objectPosition: position }}
    />
  );
}

function Frame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn("relative isolate w-full max-w-[540px]", className)}>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

function Card({ children, className, style, n = 0 }: { children: ReactNode; className?: string; style?: CSSProperties; n?: number }) {
  return (
    <div
      className={cn("ob-depth rounded-[var(--r-lg)] border border-border bg-surface shadow-card", className)}
      style={{ ...i(n), ...style }}
    >
      {children}
    </div>
  );
}

type Risk = "High" | "Medium" | "Low";
const riskClass: Record<Risk, string> = {
  High: "bg-high-bg text-high",
  Medium: "bg-med-bg text-med",
  Low: "bg-low-bg text-low",
};
function RiskPill({ risk }: { risk: Risk }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", riskClass[risk])}>{risk}</span>;
}

const QUEUE: { name: string; inv: string; amount: string; due: string; risk: Risk }[] = [
  { name: "Coromandel Foods", inv: "INV-1015", amount: "₹6,00,000", due: "1 Aug", risk: "High" },
  { name: "Aravalli Textiles", inv: "INV-1012", amount: "₹3,40,000", due: "13 Sep", risk: "High" },
  { name: "Konkan Agro Exports", inv: "INV-1025", amount: "₹2,25,000", due: "27 Sep", risk: "Medium" },
  { name: "Jaipur Ceramics", inv: "INV-1021", amount: "₹1,32,500", due: "12 Sep", risk: "Low" },
];

function QueueCard({ rows = 4, n = 0, className }: { rows?: number; n?: number; className?: string }) {
  return (
    <Card n={n} className={cn("p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-text">Collection queue</p>
        <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-brand-strong">Prioritised</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {QUEUE.slice(0, rows).map((r) => (
          <li key={r.inv} className="flex items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-semibold text-brand">
              {r.name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-text">{r.name}</span>
              <span className="block text-[11px] text-text-muted">
                {r.inv} · due {r.due}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[13px] font-semibold tabular-nums text-text">{r.amount}</span>
              <RiskPill risk={r.risk} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CopilotCard({ n = 0, className }: { n?: number; className?: string }) {
  return (
    <Card n={n} className={cn("p-4", className)}>
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand">
        <Sparkles className="size-3.5" /> AI Copilot
      </p>
      <p className="text-[12.5px] leading-snug text-text">
        Coromandel Foods disputes <b className="font-semibold">₹60,000</b> on INV-1015. Resolve the price gap before a reminder.
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
        <FileText className="size-3" /> 2 sources · email E-011, INV-1015
      </p>
    </Card>
  );
}

const BARS = [38, 52, 44, 66, 58, 80, 72];
function ChartCard({ n = 0, className }: { n?: number; className?: string }) {
  return (
    <Card n={n} className={cn("p-4", className)}>
      <p className="text-[11px] font-medium text-text-muted">Collected this week</p>
      <p className="text-lg font-semibold tabular-nums text-text">₹8,96,000</p>
      <div className="mt-2 flex h-14 items-end gap-1.5">
        {BARS.map((h, k) => (
          <span
            key={k}
            className={cn("w-full rounded-t-[3px]", k === BARS.length - 2 ? "bg-brand" : "bg-brand-tint")}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

/** Welcome / auth hero: queue + copilot + chart over paper-cut hills. */
export function HeroArt() {
  return (
    <>
      <Backdrop src="/onboarding/welcome-hero.webp" position="right center" priority />
      <Frame
        label="Illustration: a prioritised collection queue led by Coromandel Foods, an AI Copilot note citing its sources, and a weekly collections chart."
        className="py-6 sm:mr-auto sm:max-w-[360px] lg:max-w-[380px]"
      >
        <div className="relative mx-auto w-[92%] sm:w-full">
          <ChartCard n={0} className="absolute -top-6 -left-4 hidden w-44 sm:block" />
          <QueueCard n={1} rows={4} className="sm:mt-16" />
          <CopilotCard n={2} className="relative mt-3 w-[92%] sm:absolute sm:-right-8 sm:-bottom-10 sm:mt-0 sm:w-72" />
        </div>
      </Frame>
    </>
  );
}

/** Sign-in / sign-up: the secure-arch illustration on its own. */
export function AuthArt() {
  return (
    <>
      <Backdrop src="/onboarding/auth.webp" priority />
      <Frame label="Illustration: a layered paper arch around a shield with a keyhole, for secure sign-in." className="min-h-[300px]">
        {null}
      </Frame>
    </>
  );
}

/** Step 1 — Prioritise collections. */
export function QueueArt() {
  return (
    <>
      <Backdrop src="/onboarding/step-prioritise.webp" />
      <Frame label="Illustration: the collection queue ranks overdue invoices by risk, highest first." className="py-4">
        <div className="relative mx-auto w-[92%] sm:w-[82%]">
          <QueueCard n={0} rows={4} />
          <Card n={1} className="relative mt-3 flex items-center gap-3 p-3 sm:absolute sm:-right-6 sm:-bottom-8 sm:mt-0 sm:w-60">
            <span className="grid size-9 place-items-center rounded-full bg-high-bg text-high">
              <TriangleAlert className="size-4" />
            </span>
            <span>
              <span className="block text-[11px] text-text-muted">High-risk exposure</span>
              <span className="block text-sm font-semibold tabular-nums text-text">₹9,40,000</span>
            </span>
          </Card>
        </div>
      </Frame>
    </>
  );
}

const SOURCES = [
  { icon: Mail, label: "Email E-011", sub: "finance@coromandelfoods.test" },
  { icon: FileText, label: "Invoice INV-1015", sub: "Billed ₹6,00,000" },
  { icon: Paperclip, label: "Purchase order PO-4515", sub: "Agreed ₹5,40,000" },
];

/** Step 2 — Understand the context. */
export function DisputeArt() {
  return (
    <>
      <Backdrop src="/onboarding/step-context.webp" />
      <Frame label="Illustration: invoice INV-1015 for Coromandel Foods flagged as disputed, with three source records and a human-review marker." className="py-4">
        <div className="relative mx-auto w-[92%] sm:w-[82%]">
          <Card n={0} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] text-text-muted">INV-1015 · Coromandel Foods</p>
                <p className="text-lg font-semibold tabular-nums text-text">₹6,00,000</p>
              </div>
              <span className="rounded-full bg-disp-bg px-2 py-0.5 text-[11px] font-semibold text-disp">Dispute detected</span>
            </div>
            <p className="mt-3 rounded-[var(--r-md)] bg-surface-sunken p-3 text-[12.5px] leading-snug text-text">
              Customer says the agreed price was ₹5,40,000 — a ₹60,000 difference.
            </p>
            <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Source records</p>
            <ul className="flex flex-col gap-2">
              {SOURCES.map(({ icon: Icon, label, sub }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-md bg-info-bg text-info">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-text">{label}</span>
                    <span className="block truncate text-[11px] text-text-muted">{sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card n={1} className="relative mt-3 flex items-center gap-2.5 p-3 sm:absolute sm:-right-6 sm:-bottom-7 sm:mt-0 sm:w-56">
            <span className="grid size-8 place-items-center rounded-full bg-mint text-brand">
              <UserCheck className="size-4" />
            </span>
            <span className="text-[12px] font-medium text-text">Needs human review</span>
          </Card>
        </div>
      </Frame>
    </>
  );
}

/** Step 3 — Prepare with confidence. The Approve button is illustration only. */
export function DraftArt() {
  return (
    <>
      <Backdrop src="/onboarding/step-prepare.webp" />
      <Frame label="Illustration: an AI-drafted reminder to Aravalli Textiles with cited sources, waiting for a person to edit or approve it. Nothing is sent without approval." className="py-4">
        <div className="relative mx-auto w-[92%] sm:w-[82%]">
          <Card n={0} className="p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
              <Sparkles className="size-3.5" /> Draft reminder
            </p>
            <p className="mt-1 text-[11px] text-text-muted">To: accounts@aravalli-textiles.test · INV-1012</p>
            <div className="mt-3 space-y-2 rounded-[var(--r-md)] bg-surface-sunken p-3 text-[12.5px] leading-snug text-text">
              <p>Hello Aravalli Textiles team,</p>
              <p>
                Invoice INV-1012 for <b className="font-semibold">₹3,40,000</b> is past its due date of 13 Sep. Could you share an expected payment date?
              </p>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-muted">
              <ShieldCheck className="size-3.5 text-brand" /> Every figure linked to its source
            </p>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex h-9 flex-1 items-center justify-center rounded-[var(--r-md)] border border-border-strong text-[13px] font-semibold text-text">Edit</span>
              <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-md)] bg-brand text-[13px] font-semibold text-on-brand">
                <Check className="size-3.5" /> Approve
              </span>
            </div>
          </Card>
          <Card n={1} className="relative mt-3 p-3 sm:absolute sm:-right-6 sm:-bottom-8 sm:mt-0 sm:w-60">
            <p className="text-[12px] font-medium text-text">Nothing sends without your approval.</p>
          </Card>
        </div>
      </Frame>
    </>
  );
}
