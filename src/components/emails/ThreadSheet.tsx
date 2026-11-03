"use client";

import { SidePanel } from "@/components/disputes/SidePanel";
import type { EmailThread } from "@/domain/emails/threads";
import type { Invoice } from "@/domain/schema";
import { ThreadDetail } from "./ThreadDetail";

/**
 * The conversation below 1024 px: a modal sheet (full screen below `sm`)
 * that traps focus, closes on Esc and returns focus to the row that opened
 * it. Loaded on demand from EmailsView.
 */
export function ThreadSheet({
  thread,
  threadId,
  invoices,
  onClose,
}: {
  thread: EmailThread | undefined;
  threadId: string;
  invoices: Invoice[];
  onClose: () => void;
}) {
  return (
    <SidePanel
      open
      onClose={onClose}
      title={thread ? thread.subject : "Conversation not found"}
      subtitle={<span className="font-mono text-[13px]">{threadId}</span>}
    >
      {thread ? (
        <ThreadDetail thread={thread} invoices={invoices} />
      ) : (
        <p className="text-sm text-text-muted" role="status">
          No conversation with this id is in the loaded data.
        </p>
      )}
    </SidePanel>
  );
}
