import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
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
      children: ReactElement<{ children: ReactNode }>[];
    }>;
    expect(isValidElement(el) && el.type).toBe("html");
    expect(el.props.suppressHydrationWarning).toBe(true);
    // The server must not pick a theme: the script decides (stored or system).
    expect(el.props["data-theme"]).toBeUndefined();
    const head = el.props.children[0];
    expect(head?.type).toBe("head");
    expect(scripts(head).some((src) => src.includes('setAttribute("data-theme"'))).toBe(true);
  });

  // TASK-45.2 (TC-128): the splash runtime is a head script after the theme
  // script; the overlay and the inert-able app wrapper are body children that
  // tolerate the attributes the runtime sets before hydration.
  it("renders the splash script, the overlay and the app wrapper", () => {
    const el = RootLayout({ children: null, params: Promise.resolve({}) } as never) as ReactElement<{
      children: ReactElement<{ children: ReactNode }>[];
    }>;
    const [head, body] = el.props.children;
    const srcs = scripts(head);
    expect(srcs).toHaveLength(2);
    expect(srcs[1]).toContain("verilaneSplash");
    const kids = Children.toArray(body?.props.children).filter(isValidElement) as ReactElement<Record<string, unknown>>[];
    const overlay = kids.find((k) => k.props.id === "verilane-splash");
    const app = kids.find((k) => k.props.id === "verilane-app");
    expect(overlay?.props.suppressHydrationWarning).toBe(true);
    expect(String((overlay?.props.dangerouslySetInnerHTML as { __html: string }).__html)).toContain("data-splash-skip");
    expect(app?.props.suppressHydrationWarning).toBe(true);
    expect(app?.props.style).toEqual({ display: "contents" });
    expect(kids.indexOf(overlay!)).toBeLessThan(kids.indexOf(app!));
  });
});

function scripts(head: ReactElement<{ children: ReactNode }> | undefined): string[] {
  return (Children.toArray(head?.props.children).filter(isValidElement) as ReactElement<{
    dangerouslySetInnerHTML?: { __html: string };
  }>[]).map((s) => s.props.dangerouslySetInnerHTML?.__html ?? "");
}
