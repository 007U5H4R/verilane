import {
  Home,
  ListChecks,
  Flag,
  Wallet,
  Mail,
  Inbox,
  FileText,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Sits below the divider (TASK-38: Audit Log, Settings). */
  secondary?: boolean;
  // No static `count`: every nav count comes from live data via the same
  // hooks the pages use, and shows nothing while loading (TASK-33).
  /** Live Queue count (TASK-9.5). */
  liveCount?: boolean;
  /** Live open-dispute count (TASK-17.3). */
  disputeCount?: boolean;
  /** Live awaiting-approval draft count (TASK-16.5, T16-4). */
  draftCount?: boolean;
};

// TASK-38 (Design.md R2): Home / Collection Queue / Disputes / Email
// Conversations / Invoices / Drafts / Payments, a divider, Audit Log / Settings.
// Queue's, Disputes' and Drafts' counts are live (TASK-9.5, TASK-17.3, TASK-16.5).
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Collection Queue", href: "/queue", icon: ListChecks, liveCount: true },
  { label: "Disputes", href: "/disputes", icon: Flag, disputeCount: true },
  { label: "Email Conversations", href: "/emails", icon: Inbox },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Drafts", href: "/drafts", icon: Mail, draftCount: true },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Audit Log", href: "/audit", icon: ScrollText, secondary: true },
  { label: "Settings", href: "/settings", icon: Settings, secondary: true },
];
