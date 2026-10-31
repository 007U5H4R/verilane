/**
 * The extraction provider seam (TASK-12.4). Every provider — simulated now,
 * live in TASK-23 — returns a `Result`, and every output passes Zod
 * (`validateExtraction`, SR5) before anything stores it.
 */
import type { EmailMessage, Extraction } from "@/domain/schema";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Why a provider output was refused by the schema. */
export interface Rejected {
  message_id: string;
  reason: string;
  issues: string[];
}

export interface Provider {
  name: "simulated" | "faulty" | "live";
  extract(msg: EmailMessage): Promise<Result<Extraction, Rejected>>;
}
