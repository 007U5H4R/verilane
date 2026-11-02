"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import type { DisputeReviewer } from "@/domain/disputes/model";
import { useExecute } from "@/store/hooks";

/** Sets or clears one dispute's owner through the audited `assign_dispute` command. */
export function useAssignDispute(): (disputeId: string, reviewer: DisputeReviewer | null) => Promise<boolean> {
  const execute = useExecute();
  return useCallback(
    async (disputeId, reviewer) => {
      try {
        await execute({ type: "assign_dispute", subject: { kind: "dispute", id: disputeId }, payload: { reviewer } });
        toast.success(reviewer ? `${disputeId} assigned to ${reviewer}.` : `${disputeId} unassigned.`);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn’t change the owner.");
        return false;
      }
    },
    [execute],
  );
}
