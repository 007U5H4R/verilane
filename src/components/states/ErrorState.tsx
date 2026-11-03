import { Button } from "@/components/ui/button";

/** An inline error with a Retry action (TASK-9.4). */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-state="error"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface shadow-card p-4"
    >
      <p className="text-text">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
