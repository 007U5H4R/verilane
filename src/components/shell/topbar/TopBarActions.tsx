"use client";

import { AccountMenu } from "@/components/shell/AccountMenu";
import { NotificationsBell } from "@/components/shell/NotificationsBell";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

/** TASK-38: the top bar's trailing cluster — theme, bell, account. TopBar lazy-loads it as one chunk. */
export default function TopBarActions() {
  return (
    <div className="flex items-center gap-0.5 md:gap-2">
      <ThemeToggle />
      <NotificationsBell />
      <AccountMenu />
    </div>
  );
}
