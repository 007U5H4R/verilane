import {
  Home,
  ListChecks,
  Flag,
  Wallet,
  Mail,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
  /** Count comes from live data instead of `count` (TASK-9.5: Queue). */
  liveCount?: boolean;
  /** Count comes from live open-dispute data instead of `count` (TASK-17.3). */
  disputeCount?: boolean;
  /** Count comes from live awaiting-approval draft data instead of `count` (TASK-16.5). */
  draftCount?: boolean;
};

// TASK-6.5: Home / Queue / Disputes / Payments / Drafts / Audit log / Settings.
// Queue's, Disputes' and Drafts' counts are live (TASK-9.5, TASK-17.3, TASK-16.5).
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Queue", href: "/queue", icon: ListChecks, liveCount: true },
  { label: "Disputes", href: "/disputes", icon: Flag, disputeCount: true },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Drafts", href: "/drafts", icon: Mail, draftCount: true },
  { label: "Audit log", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];
