"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Zap } from "lucide-react";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { cn } from "@/lib/cn";
import { startGuestSession } from "@/lib/session";

/**
 * TASK-39: the Verilane mark + name as inline SVG/text. The shipped logo PNG
 * is black-on-white, which breaks in dark mode; this follows the theme tokens.
 */
export function Wordmark({ className }: { className?: string }) {
  const id = useId();
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--brand-strong)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${id}-g)`} />
        <path d="M9 10.5 16 22l7-11.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-text">Verilane</span>
    </span>
  );
}

/** Sets the guest flag and goes Home; the gate then loads the demo dataset. */
export function useEnterGuest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const enter = () => {
    if (pending) return;
    setPending(true);
    startGuestSession();
    router.push("/");
  };
  return { enter, pending };
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("ob-spinner inline-block size-4 rounded-full border-2 border-current border-t-transparent", className)} />;
}

/** The prominent mint guest action (full width). */
export function GuestButton({ label = "Continue as guest", className }: { label?: string; className?: string }) {
  const { enter, pending } = useEnterGuest();
  return (
    <button
      type="button"
      onClick={enter}
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "group flex min-h-12 w-full items-center gap-3 rounded-[var(--r-md)] border border-brand/25 bg-mint px-4 text-left text-sm font-semibold text-brand-strong transition-colors hover:border-brand/50 hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-80",
        className,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-brand">
        {pending ? <Spinner className="size-3.5" /> : <Zap className="size-3.5" aria-hidden />}
      </span>
      <span className="flex-1">{pending ? "Loading demo workspace…" : label}</span>
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

export const primaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--r-md)] bg-brand px-5 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
export const secondaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--r-md)] border border-border-strong bg-surface px-5 text-sm font-semibold text-text transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
export const textLink =
  "rounded-sm font-medium text-interactive underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Header shared by the shell-less screens: wordmark (home link) + theme toggle. */
export function AuthHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/welcome" aria-label="Verilane — welcome" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
        <Wordmark />
      </Link>
      <div className="flex items-center gap-3">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}

/**
 * Split layout: content column + art panel. Below lg the art stacks after the
 * content (mobile order: logo → copy → actions → illustration).
 */
export function SplitLayout({ children, art, artLabel }: { children: ReactNode; art: ReactNode; artLabel: string }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main className="flex min-w-0 flex-col px-4 py-6 sm:px-10 sm:py-8 lg:px-14 xl:px-20">{children}</main>
        <aside aria-label={artLabel} className="min-w-0 px-4 pb-10 sm:px-10 lg:p-4 lg:pl-0">
          <div className="ob-art-panel relative flex h-full min-h-[340px] items-center justify-center overflow-hidden rounded-[22px] border border-border p-5 sm:min-h-[420px] sm:p-10">
            {art}
          </div>
        </aside>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

/** Labelled input with an inline error wired through aria-describedby. */
export function Field({ label, error, hint, id: idProp, ...input }: FieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass(!!error)} {...input} />
      {error && (
        <p id={errId} className="text-sm text-high">
          {error}
        </p>
      )}
      {hint && <div id={hintId}>{hint}</div>}
    </div>
  );
}

function inputClass(invalid: boolean) {
  return cn(
    "min-h-12 w-full rounded-[var(--r-md)] border bg-surface px-3.5 text-base text-text placeholder:text-text-muted/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand sm:text-sm",
    invalid ? "border-high" : "border-border-strong hover:border-brand/40",
  );
}

export function PasswordField({ label, error, hint, id: idProp, ...input }: FieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const [shown, setShown] = useState(false);
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputClass(!!error), "pr-12")}
          {...input}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[var(--r-md)] text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {error && (
        <p id={errId} className="text-sm text-high">
          {error}
        </p>
      )}
      {hint && <div id={hintId}>{hint}</div>}
    </div>
  );
}

/** "or" divider between the form actions and the guest action. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
