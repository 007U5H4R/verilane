"use client";

import Link from "next/link";
import { ArrowLeft, Check, Info } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { PASSWORD_RULES, validateSignIn, validateSignUp, type FieldErrors } from "@/lib/auth-validation";

import { AuthArt } from "./art";
import { AuthHeader, Field, GuestButton, OrDivider, PasswordField, SplitLayout, primaryBtn, textLink } from "./primitives";

/**
 * TASK-39: Sign in and Create account. Verilane has no account backend, so a
 * valid submit never pretends to succeed — it shows an honest notice and
 * offers guest mode. Nothing typed here is sent or stored.
 */

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SplitLayout art={<AuthArt />} artLabel="Illustration">
      <AuthHeader />
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="ob-rise w-full max-w-[420px]">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-text sm:text-[2.5rem]">{title}</h1>
          <p className="mt-2 text-base text-text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </SplitLayout>
  );
}

/** The honest result of a submit: accounts don't exist yet in this demo. */
function DemoNotice({ noticeRef }: { noticeRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={noticeRef}
      tabIndex={-1}
      role="status"
      className="ob-rise flex flex-col gap-3 rounded-[var(--r-lg)] border border-info/30 bg-info-bg p-4 focus:outline-none"
    >
      <p className="flex items-start gap-2.5 text-sm text-text">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          <b className="font-semibold">Accounts aren&apos;t available in this demo yet.</b> Nothing you typed was sent or saved. Continue as a guest to explore Verilane
          with demo data.
        </span>
      </p>
      <GuestButton />
    </div>
  );
}

function useSubmitNotice() {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const show = () => {
    setShown(true);
    // Move focus so keyboard and screen-reader users land on the outcome.
    requestAnimationFrame(() => ref.current?.focus());
  };
  return { shown, ref, show };
}

/** Focus the first invalid field, in form order. */
function focusFirstError(form: HTMLFormElement, errors: Record<string, string | undefined>, order: string[]) {
  const first = order.find((k) => errors[k]);
  if (first) (form.elements.namedItem(first) as HTMLInputElement | null)?.focus();
}

export function SignInForm() {
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const [submitted, setSubmitted] = useState(false);
  const notice = useSubmitNotice();

  const update = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...values, [k]: e.target.value };
    setValues(next);
    if (submitted) setErrors(validateSignIn(next));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateSignIn(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(e.currentTarget, errs, ["email", "password"]);
      return;
    }
    notice.show();
  };

  return (
    <AuthFrame title="Welcome back." subtitle="Sign in to your Verilane workspace.">
      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" aria-label="Sign in">
        <Field label="Work email" name="email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={update("email")} error={errors.email} />
        <PasswordField label="Password" name="password" autoComplete="current-password" value={values.password} onChange={update("password")} error={errors.password} />
        <button type="submit" className={cn(primaryBtn, "mt-2")}>
          Sign in
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-4">
        {notice.shown ? (
          <DemoNotice noticeRef={notice.ref} />
        ) : (
          <>
            <OrDivider />
            <GuestButton />
          </>
        )}
        <p className="text-sm text-text-muted">
          New to Verilane?{" "}
          <Link href="/sign-up" className={textLink}>
            Create an account
          </Link>
        </p>
        <BackLink href="/welcome">Back to welcome</BackLink>
      </div>
    </AuthFrame>
  );
}

export function SignUpForm() {
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<"name" | "email" | "password">>({});
  const [submitted, setSubmitted] = useState(false);
  const notice = useSubmitNotice();

  const update = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...values, [k]: e.target.value };
    setValues(next);
    if (submitted) setErrors(validateSignUp(next));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateSignUp(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(e.currentTarget, errs, ["name", "email", "password"]);
      return;
    }
    notice.show();
  };

  return (
    <AuthFrame title="Create your account." subtitle="Get started with your own workspace.">
      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" aria-label="Create account">
        <Field label="Full name" name="name" autoComplete="name" value={values.name} onChange={update("name")} error={errors.name} />
        <Field label="Work email" name="email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={update("email")} error={errors.email} />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update("password")}
          error={errors.password}
          hint={<PasswordHints value={values.password} />}
        />
        <button type="submit" className={cn(primaryBtn, "mt-2")}>
          Create account
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-4">
        {notice.shown ? (
          <DemoNotice noticeRef={notice.ref} />
        ) : (
          <>
            <OrDivider />
            <GuestButton />
          </>
        )}
        <BackLink href="/sign-in">Back to sign in</BackLink>
      </div>
    </AuthFrame>
  );
}

function PasswordHints({ value }: { value: string }) {
  return (
    <div className="pt-1">
      <p className="text-xs text-text-muted">Password hints (checked in your browser only):</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {PASSWORD_RULES.map((r) => {
          const met = r.test(value);
          return (
            <li key={r.id} className={cn("flex items-center gap-1.5 text-xs", met ? "text-brand" : "text-text-muted")}>
              <Check className={cn("size-3.5", met ? "opacity-100" : "opacity-30")} aria-hidden />
              {r.label}
              <span className="sr-only">{met ? "(met)" : "(not met)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(textLink, "inline-flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text")}>
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
