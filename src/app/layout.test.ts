import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "inter-var" }) }));

const { default: RootLayout } = await import("./layout");

// TASK-38 scar: THEME_SCRIPT sets data-theme on <html> before React hydrates,
// so the server HTML and the client DOM always differ on that attribute. The
// documented fix (Next docs, "Preventing flash before hydration" > Themes) is
// suppressHydrationWarning on <html>. Prod React never prints the attribute
// diff, so the e2e check (topbar.spec.ts) can't catch it regressing; this can.
describe("RootLayout", () => {
  it("lets the pre-paint theme script own data-theme on <html> without a hydration warning", () => {
    const el = RootLayout({ children: null, params: Promise.resolve({}) } as never) as ReactElement<{
      suppressHydrationWarning?: boolean;
      "data-theme"?: string;
      children: ReactElement<{ children: ReactElement<{ dangerouslySetInnerHTML?: { __html: string } }> }>[];
    }>;
    expect(isValidElement(el) && el.type).toBe("html");
    expect(el.props.suppressHydrationWarning).toBe(true);
    // The server must not pick a theme: the script decides (stored or system).
    expect(el.props["data-theme"]).toBeUndefined();
    const head = el.props.children[0];
    expect(head?.type).toBe("head");
    expect(head?.props.children.props.dangerouslySetInnerHTML?.__html).toContain('setAttribute("data-theme"');
  });
});
