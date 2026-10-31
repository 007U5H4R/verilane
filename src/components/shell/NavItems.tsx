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
};

// TASK-6.5: Home / Queue / Disputes / Payments / Drafts / Audit log / Settings.
// Counts are static placeholders until the Queue/Disputes/Drafts data land (TASK-7+).
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Queue", href: "/queue", icon: ListChecks, count: 48 },
  { label: "Disputes", href: "/disputes", icon: Flag, count: 3 },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Drafts", href: "/drafts", icon: Mail, count: 2 },
  { label: "Audit log", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];
