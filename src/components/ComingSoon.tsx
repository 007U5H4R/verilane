// TASK-6.6: the only allowed stub — every nav destination must resolve (200),
// but real content for most pages lands with their milestone.
export function ComingSoon({ milestone }: { milestone: string }) {
  return (
    <div className="flex flex-col items-start gap-1 p-7">
      <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
        Coming soon
      </h1>
      <p className="text-text-muted">
        This page ships with <span className="font-semibold">{milestone}</span>.
      </p>
    </div>
  );
}
