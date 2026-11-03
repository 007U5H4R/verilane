import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  CircleCheck,
  CircleCheckBig,
  CircleHelp,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  FilePen,
  FilePlus2,
  FileText,
  FileX,
  Flag,
  ListOrdered,
  RotateCcw,
  Scale,
  Send,
  Settings,
  ShieldAlert,
  StickyNote,
  Upload,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AuditIcon, AuditModule, AuditTone } from "@/domain/audit/classify";

export const ACTION_ICON: Record<AuditIcon, LucideIcon> = {
  note: StickyNote,
  draft: FilePlus2,
  edit: FilePen,
  send: Send,
  approve: CircleCheck,
  reject: CircleX,
  blocked: ShieldAlert,
  flag: Flag,
  transition: ArrowRightLeft,
  resolve: CircleCheckBig,
  dismiss: CircleSlash,
  review: ClipboardCheck,
  import: Upload,
  import_rejected: FileX,
  reset: RotateCcw,
  role: UserCog,
  clock: CalendarClock,
  unknown: CircleHelp,
};

export const MODULE_ICON: Record<AuditModule, LucideIcon> = {
  queue: ListOrdered,
  drafts: FileText,
  disputes: Scale,
  payments: Wallet,
  settings: Settings,
  workspace: Building2,
  unknown: CircleHelp,
};

/** Semantic badge colours per tone — tokens only. */
export const TONE_CLASS: Record<AuditTone, string> = {
  success: "bg-low-bg text-low",
  danger: "bg-high-bg text-high",
  warning: "bg-med-bg text-med",
  info: "bg-info-bg text-info",
  dispute: "bg-disp-bg text-disp",
  neutral: "bg-surface-sunken text-text-muted",
};
