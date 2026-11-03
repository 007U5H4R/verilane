"use client";

/**
 * The band under the Investigation header (TASK-15.5, Design.md §13): one
 * sentence on what has to happen next on this invoice, and why.
 */
export function NextStepCallout({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-md bg-brand-tint px-4 py-3 text-sm text-text" data-testid="next-step">
      <b className="font-semibold">Next step:</b> {text}
    </div>
  );
}
