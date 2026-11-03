import { describe, expect, it } from "vitest";
import { InvalidCommand, PermissionDenied } from "@/domain/commandConstants";
import { runAutopilotBatch, type AutopilotNotice } from "./autopilotBatch";

const items = [
  { id: "D-1", who: "Acme" },
  { id: "D-2", who: "Birla" },
];

function recorder() {
  const notices: AutopilotNotice[] = [];
  return { notices, notify: (n: AutopilotNotice) => notices.push(n) };
}

describe("runAutopilotBatch", () => {
  it("tells the user when a send fails for an unexpected reason (CR-007 / S-3)", async () => {
    const { notices, notify } = recorder();
    await runAutopilotBatch(items, {
      send: async (id) => {
        if (id === "D-1") throw new Error("QuotaExceededError");
        return "sent";
      },
      notify,
      isCancelled: () => false,
    });
    expect(notices).toEqual([
      { kind: "failed", who: "Acme" },
      { kind: "sent", who: "Birla" },
    ]);
  });

  it("keeps a policy refusal quiet: the draft simply waits for a person", async () => {
    const { notices, notify } = recorder();
    await runAutopilotBatch(items, {
      send: async (id) => {
        if (id === "D-1") throw new PermissionDenied("autopilot_send", "off");
        throw new InvalidCommand("changed");
      },
      notify,
      isCancelled: () => false,
    });
    expect(notices).toEqual([]);
  });

  it("reports a held draft", async () => {
    const { notices, notify } = recorder();
    await runAutopilotBatch(items.slice(0, 1), { send: async () => "held", notify, isCancelled: () => false });
    expect(notices).toEqual([{ kind: "held", who: "Acme" }]);
  });

  it("stops sending and stays silent once cancelled (CR-007 / C-4)", async () => {
    const { notices, notify } = recorder();
    const sent: string[] = [];
    let cancelled = false;
    await runAutopilotBatch(items, {
      send: async (id) => {
        sent.push(id);
        cancelled = true; // unmounted while this send was in flight
        return "sent";
      },
      notify,
      isCancelled: () => cancelled,
    });
    expect(sent).toEqual(["D-1"]);
    expect(notices).toEqual([]);
  });
});
