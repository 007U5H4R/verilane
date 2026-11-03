import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootError from "./error";
import GlobalError from "./global-error";

// CR-005: an uncaught render error anywhere outside /invoices/[id] must land
// on a branded recovery screen, not Next's default error page.
describe("root error boundaries", () => {
  it("error.tsx renders an alert with Try again and a way home", () => {
    const html = renderToStaticMarkup(
      createElement(RootError, { error: new Error("boom"), retry: () => {} }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("boom");
  });

  it("global-error.tsx renders its own html and body", () => {
    const html = renderToStaticMarkup(
      createElement(GlobalError, { error: new Error("boom"), retry: () => {} }),
    );
    expect(html).toMatch(/^<html/);
    expect(html).toContain("<body");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).not.toContain("boom");
  });
});
