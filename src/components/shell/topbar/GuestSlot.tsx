"use client";

import { lazy, Suspense } from "react";

import { useIsStoredGuest } from "@/lib/session";

// TASK-39: the guest badge, shown only to a visitor who chose guest mode
// (never the e2e build's implicit session). Lazy, so it stays out of every
// route's first-load JS (route-budget).
const GuestBadge = lazy(() => import("@/components/onboarding/GuestBadge").then((m) => ({ default: m.GuestBadge })));

export function GuestSlot() {
  const storedGuest = useIsStoredGuest();
  if (!storedGuest) return null;
  return (
    <Suspense fallback={null}>
      <GuestBadge />
    </Suspense>
  );
}
