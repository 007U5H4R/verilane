import { describe, expect, it } from "vitest";
import type { EmailMessage } from "@/domain/schema";
import { FAULT_KINDS, faulty } from "./faulty";
import { simulateExtraction, simulatedProvider } from "./simulated";
import { crossCheck, validateExtraction } from "./validateExtraction";

const msg: EmailMessage = {
  thread_id: "E-007",
  message_id: "E-007-1",
  from_address: "ap@example.com",
  sent_at: "2026-10-28T09:00:00Z",
  subject: "INV-1042",
  body: "We paid INV-1042 on 27/10/2026, ₹3,00,000 via NEFT.",
};

const bare: EmailMessage = { ...msg, message_id: "E-008-1", body: "Thanks, noted." };

describe("faulty provider (TASK-22.1, TC-070)", () => {
  it("covers the six fault kinds named in the plan", () => {
    expect(FAULT_KINDS).toEqual([
      "malformed_json",
      "missing_fields",
      "bad_enum",
      "hallucinated_amount",
      "wrong_ref",
      "refusal",
    ]);
  });

  for (const kind of FAULT_KINDS) {
    it(`${kind}: the output is rejected (ok:false) with the message id and a reason`, async () => {
      const provider = faulty(simulatedProvider, kind);
      expect(provider.name).toBe("faulty");
      for (const m of [msg, bare]) {
        const result = await provider.extract(m);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.message_id).toBe(m.message_id);
        expect(result.error.reason.length).toBeGreaterThan(0);
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it(`${kind}: deterministic — the same message gives the same rejection`, async () => {
      const provider = faulty(simulatedProvider, kind);
      expect(await provider.extract(msg)).toEqual(await provider.extract(msg));
    });
  }

  it("names the cause: cross-check for invented facts, schema for broken shape, parse for bad JSON", async () => {
    const reason = async (kind: (typeof FAULT_KINDS)[number]) => {
      const r = await faulty(simulatedProvider, kind).extract(msg);
      return r.ok ? "" : r.error.reason;
    };
    expect(await reason("malformed_json")).toBe("malformed JSON");
    expect(await reason("missing_fields")).toBe("schema validation failed");
    expect(await reason("bad_enum")).toBe("schema validation failed");
    expect(await reason("refusal")).toBe("schema validation failed");
    expect(await reason("hallucinated_amount")).toBe("cross-check failed");
    expect(await reason("wrong_ref")).toBe("cross-check failed");
  });

  it("passes a base rejection through unchanged", async () => {
    const error = { message_id: msg.message_id, reason: "upstream", issues: ["x"] };
    const base = { name: "simulated" as const, extract: async () => ({ ok: false as const, error }) };
    expect(await faulty(base, "bad_enum").extract(msg)).toEqual({ ok: false, error });
  });
});

describe("crossCheck (TASK-22.2)", () => {
  it("accepts amounts and refs that appear as tokens in the source", () => {
    expect(crossCheck(simulateExtraction(msg), msg)).toEqual([]);
  });

  it("flags an amount the email never states", () => {
    const x = { ...simulateExtraction(msg), amounts: [30_000_000, 12_345] };
    expect(crossCheck(x, msg)).toEqual(["amounts.1: 12345 paise does not appear in the email"]);
  });

  it("flags a ref the email never cites, comparing normalised refs", () => {
    const x = { ...simulateExtraction(msg), invoice_refs: ["INV-1042", "INV-9999"] };
    expect(crossCheck(x, msg)).toEqual(["invoice_refs.1: INV-9999 does not appear in the email"]);
  });

  it("validateExtraction rejects a schema-valid output that fails the cross-check", () => {
    const x = { ...simulateExtraction(msg), invoice_refs: ["INV-9999"] };
    const result = validateExtraction(x, msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe("cross-check failed");
  });

  it("without the source body only the schema is checked (re-validation of stored rows)", () => {
    const x = { ...simulateExtraction(msg), invoice_refs: ["INV-9999"] };
    expect(validateExtraction(x, { message_id: msg.message_id }).ok).toBe(true);
  });
});
