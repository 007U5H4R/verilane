/**
 * Stage 3 (Execute agent, TKT-75.04) from the detail page. Risk (a): before
 * Execute runs, Policy is (re-)evaluated for the CURRENT inputs — a latest
 * decision with another fingerprint gets a fresh row appended — and Execute
 * is handed that fingerprint, so it acts on the fresh row or refuses; it
 * never acts on a stale one (EXE180).
 */
import type { ExecuteOutcome } from "@/domain/commands";
import { err, ok, type Rejected, type Result } from "@/domain/result";
import type { VerilaneDb } from "./db";
import { ensurePolicyEvaluated, policyInputsFor, type ExceptionDetail } from "./hooks";
import { executeAgent } from "./tx";

/** `ok(null)` when Execute doesn't apply (closed, or not a payment exception). */
export async function runExecuteAgentFor(
  db: VerilaneDb,
  detail: ExceptionDetail,
): Promise<Result<ExecuteOutcome | null, Rejected>> {
  const inputs = policyInputsFor(detail);
  if (!inputs.ok) return inputs;
  if (inputs.value === null) return ok(null);
  const evaluated = await ensurePolicyEvaluated(db, detail);
  if (!evaluated.ok) return evaluated;
  try {
    return ok(
      await executeAgent(db, {
        subject: { kind: "review", id: detail.exception.review_id },
        expected_fingerprint: inputs.value.fingerprint,
      }),
    );
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
