/**
 * TC-75.43 / TC-75.44 (TKT-75.07, EXE172) — the Home NSM section: heading,
 * the literal "Simulated" label wherever the figure appears, Design §6
 * styling, the four screen states plus offline, and no fixed widths that
 * could force a horizontal scroll at 375/768px. Node environment, so the
 * component renders to static markup.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NSM_HEADING, NSM_LABEL, type NsmResult } from "@/domain/nsm";
import { NsmSection } from "./NsmSection";

const result = (valuePaise: number, resolvedCount: number): NsmResult => ({
  valuePaise,
  resolvedCount,
  label: NSM_LABEL,
  sessionStartEventId: null,
  sessionStartedAt: null,
  guardrails: {
    closings: resolvedCount,
    reversedOrReopened: 0,
    reversalRate: null,
    reminderSends: 0,
    inappropriateReminders: 0,
    inappropriateReminderRate: null,
    actionsWithoutApproval: 0,
    medianRaisedToResolvedMs: null,
    resolutionTimesMeasured: 0,
    resolutionTimesUnmeasured: 0,
    escalated: 0,
    evaluated: 0,
    escalationRate: null,
  },
});

const render = (props: Parameters<typeof NsmSection>[0]) => renderToStaticMarkup(createElement(NsmSection, props));
const stateOf = (html: string) => /data-nsm-state="([a-z]+)"/.exec(html)?.[1];

describe("NsmSection — working (TC-75.44)", () => {
  const html = render({ result: result(12_345_600, 2), online: true });

  it("shows the North Star Metric heading and the computed figure in INR", () => {
    expect(html).toContain(NSM_HEADING);
    expect(html).toContain('data-testid="home-nsm-value"');
    expect(html).toMatch(/data-testid="home-nsm-value"[^>]*>₹1,23,456(\.00)?</);
    expect(stateOf(html)).toBe("working");
  });

  it("TC-75.43: carries the literal Simulated label next to the figure", () => {
    expect(html).toContain("Simulated — one demo session = one analyst-week");
    expect(html).toContain('data-testid="home-nsm-label"');
  });

  it("Design §6: brand-tint container, 10px radius, brand left border; 11px label, 24px display value in brand, 13px muted description", () => {
    const section = /<section[^>]*data-testid="home-nsm"[^>]*>/.exec(html)?.[0] ?? "";
    expect(section).toContain("bg-brand-tint");
    expect(section).toContain("rounded-[10px]");
    expect(section).toMatch(/border-l-\[?\d/);
    expect(section).toContain("border-brand");
    expect(html).toMatch(/<h2[^>]*class="[^"]*text-\[11px\][^"]*uppercase[^"]*text-text-muted/);
    expect(html).toMatch(/data-testid="home-nsm-value"[^>]*class="[^"]*font-display[^"]*text-\[24px\][^"]*text-brand\b/);
    expect(html).toMatch(/data-testid="home-nsm-label"[^>]*class="[^"]*text-\[13px\][^"]*text-text-muted/);
  });

  it("never adds a page-level data-state hook (Home e2e specs locate [data-state=working] strictly)", () => {
    for (const h of [html, render({ result: result(0, 0), online: true }), render({ result: undefined, online: true })])
      expect(h).not.toContain("data-state=");
  });

  it("is labelled by its heading for assistive tech", () => {
    expect(html).toMatch(/<section[^>]*aria-labelledby="home-nsm-title"/);
    expect(html).toMatch(/<h2[^>]*id="home-nsm-title"/);
  });

  it("has no fixed width and can shrink and wrap (no horizontal scroll at 375/768px)", () => {
    expect(html).toContain("min-w-0");
    expect(html).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]|whitespace-nowrap/);
    expect(html).toContain("break-words");
  });

  it("says how many exceptions the figure is made of", () => {
    expect(html).toContain("2 exceptions resolved this session");
    expect(render({ result: result(100, 1), online: true })).toContain("1 exception resolved this session");
  });
});

describe("NsmSection — other states (TC-75.44)", () => {
  it("loading: a busy skeleton, no figure, label still present", () => {
    const html = render({ result: undefined, online: true });
    expect(stateOf(html)).toBe("loading");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="home-nsm-value"');
    expect(html).toContain(NSM_LABEL);
  });

  it("empty: ₹0 with plain no-resolutions copy and the label", () => {
    const html = render({ result: result(0, 0), online: true });
    expect(stateOf(html)).toBe("empty");
    expect(html).toMatch(/data-testid="home-nsm-value"[^>]*>₹0(\.00)?</);
    expect(html).toContain("No exceptions resolved yet this session.");
    expect(html).toContain(NSM_LABEL);
  });

  it("error: an alert with Retry inside the section, label kept", () => {
    const html = render({ result: undefined, online: true, error: true, onRetry: () => undefined });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn’t compute the North Star Metric.");
    expect(html).toContain("Retry");
    expect(html).toContain(NSM_HEADING);
  });

  it("offline: the local figure still shows, with a note; online shows no note", () => {
    const off = render({ result: result(500, 1), online: false });
    expect(off).toContain('data-testid="home-nsm-offline"');
    expect(off).toContain("Offline — computed from this device’s data.");
    expect(off).toContain('data-testid="home-nsm-value"');
    expect(off).toContain(NSM_LABEL);
    expect(render({ result: result(500, 1), online: true })).not.toContain("home-nsm-offline");
  });
});
