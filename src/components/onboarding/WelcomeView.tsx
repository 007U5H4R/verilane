"use client";

import Link from "next/link";
import { CheckCircle2, Database, LayoutDashboard, PlayCircle } from "lucide-react";
import type { CSSProperties } from "react";

import { HeroArt } from "./art";
import { AuthHeader, GuestButton, OrDivider, SplitLayout, primaryBtn, secondaryBtn, textLink } from "./primitives";

const TRUST = [
  { icon: Database, label: "Explore with demo data" },
  { icon: CheckCircle2, label: "No setup needed" },
  { icon: LayoutDashboard, label: "Full product experience" },
];

const rise = (n: number) => ({ "--ob-i": n }) as CSSProperties;

export function WelcomeView() {
  return (
    <SplitLayout art={<HeroArt />} artLabel="Product preview">
      <AuthHeader />
      <div className="flex flex-1 flex-col justify-center py-10 lg:py-16">
        <div className="w-full max-w-[460px]">
          <p className="ob-rise text-xs font-semibold tracking-[0.14em] text-brand" style={rise(0)}>
            AI-POWERED ACCOUNTS RECEIVABLE
          </p>
          <h1 className="ob-rise mt-4 text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-text sm:text-[3.25rem]" style={rise(1)}>
            Collections, with clarity.
          </h1>
          <p className="ob-rise mt-5 text-base leading-relaxed text-text-muted sm:text-[17px]" style={rise(2)}>
            Prioritise overdue invoices, understand payment risks and prepare better customer follow-ups — with AI that keeps every decision traceable.
          </p>

          <div className="ob-rise mt-8 flex flex-col gap-3" style={rise(3)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/sign-in" className={primaryBtn}>
                Sign in
              </Link>
              <Link href="/sign-up" className={secondaryBtn}>
                Create account
              </Link>
            </div>
            <OrDivider />
            <GuestButton />
          </div>

          <ul className="ob-rise mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-5" style={rise(4)}>
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-text-muted">
                <Icon className="size-4 text-brand" aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          <p className="ob-rise mt-7" style={rise(5)}>
            <Link href="/onboarding?step=1" className={`${textLink} inline-flex items-center gap-1.5 text-sm`}>
              <PlayCircle className="size-4" aria-hidden />
              Take the 30-second tour
            </Link>
          </p>
        </div>
      </div>
    </SplitLayout>
  );
}
