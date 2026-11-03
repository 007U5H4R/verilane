import type { DraftStatus } from "@/domain/schema";
import { TOUR_INVOICES } from "@/domain/tour/invoices";

/** What the tour reads from the database to decide where the viewer is. */
export type TourSnapshot = {
  role: "analyst" | "manager";
  autopilotEnabled: boolean;
  draftA: { status: DraftStatus; sent_by?: "human" | "copilot" } | null;
  draftB: { status: DraftStatus; sent_by?: "human" | "copilot" } | null;
};

export type TourStage = {
  /** The "👉 do this" line. */
  prompt: string;
  /** CSS selector of the element to ring. */
  target: string;
  /** Pathname the target lives on. */
  route: string;
  /** Where to send a viewer who is on another page: the nav link, or More on mobile. */
  navHint?: { label: string; target: string; mobileTarget: string };
};

export type TourStep = {
  id: string;
  title: string;
  /** Approved pitch copy, verbatim from the spec. */
  pitch: string;
  stages: (TourStage & { done: (s: TourSnapshot) => boolean })[];
  /** "next" = look-only, advances on Next; otherwise advances when the data change lands. */
  completes: "next" | ((s: TourSnapshot) => boolean);
};

const A = TOUR_INVOICES.a;
const B = TOUR_INVOICES.b;
const INVOICE_A = `/invoices/${A}`;
const INVOICE_B = `/invoices/${B}`;

const never = () => false;

const QUEUE_HINT = { label: "Queue", target: "[data-tour=nav-queue]", mobileTarget: "[data-tour=tab-queue]" };
const SETTINGS_HINT = { label: "Settings", target: "[data-tour=nav-settings]", mobileTarget: "[data-tour=nav-more]" };
const AUDIT_HINT = { label: "Audit Log", target: "[data-tour=nav-audit]", mobileTarget: "[data-tour=nav-more]" };
const ROLE_SWITCHER = "[data-tour=role-switcher]";
const PRIMARY = "[data-testid=primary-action]";

const sentBy = (d: TourSnapshot["draftA"], who: "human" | "copilot") => d?.status === "sent_simulated" && d.sent_by === who;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "queue-ranked",
    title: "Who matters today",
    pitch:
      "Most collections tools chase everyone, harder. Verilane ranks every open invoice by what is actually at stake: how late it is, how big it is, and whether the customer has broken a promise.",
    stages: [{ prompt: "Look over the ranked list, then press Next.", target: "[data-tour=queue-list]", route: "/queue", navHint: QUEUE_HINT, done: never }],
    completes: "next",
  },
  {
    id: "queue-hold",
    title: "Who not to chase",
    pitch:
      "Sometimes the smartest action is to not send a reminder. This customer says they've already paid and the ledger hasn't caught up yet, so Verilane holds the invoice for reconciliation instead of sending an awkward reminder.",
    stages: [
      { prompt: "This invoice is on hold, not chased. Press Next.", target: "[data-tour=queue-row-INV-D]", route: "/queue", navHint: QUEUE_HINT, done: never },
      { prompt: `Open the top invoice, ${A}.`, target: `a[href="${INVOICE_A}"]`, route: "/queue", navHint: QUEUE_HINT, done: never },
    ],
    completes: "next",
  },
  {
    id: "invoice-why",
    title: "The why, with receipts",
    pitch:
      "Here is why this invoice is at the top: it is 47 days late, the amount is ₹3.4L, and the customer missed a payment date they promised. Each reason links to the email it came from.",
    stages: [{ prompt: "Read the reasons, then click “Generate draft”.", target: "[data-testid=priority-reason]", route: INVOICE_A, navHint: QUEUE_HINT, done: never }],
    completes: (s) => s.draftA !== null,
  },
  {
    id: "invoice-checks",
    title: "Nothing leaves without evidence",
    pitch:
      "Copilot wrote the reminder, but before anyone can send it, the draft is checked nine ways: the amount, the dates, the payments and the tone are all compared against your ledger. A draft that fails any check can't be approved.",
    stages: [
      { prompt: "All nine checks are listed here. Press Next.", target: "[data-testid=checks-summary]", route: INVOICE_A, navHint: QUEUE_HINT, done: never },
      { prompt: "Click “Submit for approval”.", target: PRIMARY, route: INVOICE_A, navHint: QUEUE_HINT, done: never },
    ],
    completes: (s) => s.draftA?.status === "validated" || s.draftA?.status === "sent_simulated",
  },
  {
    id: "invoice-approve",
    title: "A person signs off",
    pitch:
      "AI drafts, and a person decides. Nothing goes to a customer until someone with the right authority approves it. Switch to Manager, the senior person, and approve it.",
    stages: [
      { prompt: "Switch the role to Manager.", target: ROLE_SWITCHER, route: INVOICE_A, navHint: QUEUE_HINT, done: (s) => s.role === "manager" },
      { prompt: "Click “Approve & send”.", target: PRIMARY, route: INVOICE_A, navHint: QUEUE_HINT, done: never },
    ],
    completes: (s) => sentBy(s.draftA, "human"),
  },
  {
    id: "settings-autopilot",
    title: "You set the rules",
    pitch:
      "Want to stop clicking approve on every small reminder? As a Manager, you can let Copilot send the lowest-risk ones by itself. The draft has to pass all nine checks and stay under a cap you choose, and switching it off takes one click.",
    stages: [{ prompt: "Turn on “Let Copilot send low-risk reminders”.", target: "[data-testid=autopilot-control]", route: "/settings", navHint: SETTINGS_HINT, done: never }],
    completes: (s) => s.autopilotEnabled,
  },
  {
    id: "invoice-autopilot",
    title: "Watch Copilot work",
    pitch:
      "Now switch back to Analyst, the person doing the day-to-day work. Here is a ₹40,000 reminder that passes every check. Submit it, and Copilot sends it within a second, under the rules you just set. Anything over the cap, or anything with a failed check, waits for a person and shows the reason.",
    stages: [
      { prompt: "Switch the role back to Analyst.", target: ROLE_SWITCHER, route: INVOICE_B, navHint: QUEUE_HINT, done: (s) => s.role === "analyst" },
      { prompt: "Click “Generate draft”.", target: "[data-testid=draft-panel]", route: INVOICE_B, navHint: QUEUE_HINT, done: (s) => s.draftB !== null },
      { prompt: "Click “Submit for approval” and watch Copilot send it.", target: PRIMARY, route: INVOICE_B, navHint: QUEUE_HINT, done: never },
    ],
    completes: (s) => sentBy(s.draftB, "copilot"),
  },
  {
    id: "audit",
    title: "Clarity and control",
    pitch:
      "Your approval and Copilot's send are both in the log, each with who did it, why, and the evidence behind it. Verilane gives you clarity and control over your receivables, without blindly trusting AI.",
    stages: [{ prompt: "Find your send and Copilot's send, then press Finish.", target: "[data-tour=audit-table]", route: "/audit", navHint: AUDIT_HINT, done: never }],
    completes: "next",
  },
];

export function isStepComplete(step: TourStep, s: TourSnapshot): boolean {
  return step.completes === "next" ? false : step.completes(s);
}

export function currentStage(
  step: TourStep,
  s: TourSnapshot,
  pathname: string,
  substage: number,
): { kind: "stage"; stage: TourStage } | { kind: "wrong-page"; stage: TourStage } {
  const from = Math.min(Math.max(0, substage), step.stages.length - 1);
  const chosen = step.stages.slice(from).find((st) => !st.done(s)) ?? step.stages.at(-1);
  if (!chosen) throw new Error(`Tour step ${step.id} has no stages`);
  const { done: _done, ...stage } = chosen;
  return { kind: pathname === stage.route ? "stage" : "wrong-page", stage };
}
