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
};

// TASK-6.5: Home / Queue / Disputes / Payments / Drafts / Audit log / Settings.
// Queue's count is live (TASK-9.5); Disputes/Drafts are still static
// placeholders until their data land.
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Queue", href: "/queue", icon: ListChecks, liveCount: true },
  { label: "Disputes", href: "/disputes", icon: Flag, count: 3 },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Drafts", href: "/drafts", icon: Mail, count: 2 },
  { label: "Audit log", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];
