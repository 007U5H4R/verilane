/**
 * TC-75.44 (TKT-75.07, EXE172) — the Exceptions task card on Home: open
 * payment exceptions render as their own card in the attention feed, with a
 * count summary and a link to /exceptions. The card itself shipped in
 * TKT-75.02 (EXE127); this pins it at the component level.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { attentionGroups } from "@/domain/home/attention";
import { TaskFeed } from "./TaskFeed";

describe("TaskFeed — Exceptions card (TC-75.44)", () => {
  const groups = attentionGroups({
    items: [],
    payments: [],
    customerNames: new Map(),
    drafts: [],
    reviews: [],
    exceptions: [
      { review_id: "RV-PAY-P-012", kind: "unallocated_payment", payment_id: "P-012", amount_paise: 2_500_000 },
      { review_id: "RV-PAY-P-013", kind: "unallocated_payment", payment_id: "P-013", amount_paise: 100_000 },
    ],
  });
  const html = renderToStaticMarkup(createElement(TaskFeed, { groups }));

  it("renders an Exceptions card with its count and a link to the exceptions list", () => {
    expect(html).toContain('data-testid="feed-exceptions"');
    expect(html).toContain("2 payment exceptions need review");
    expect(html).toContain('href="/exceptions"');
    expect(html).toContain('href="/exceptions/RV-PAY-P-012"');
  });
});
