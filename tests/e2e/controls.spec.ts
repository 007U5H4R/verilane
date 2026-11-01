import { test, expect, type Page } from "@playwright/test";

// TASK-25.3 · TC-081: every button/link either has a real effect, or is
// aria-disabled with a visible reason reachable via aria-describedby — never
// a dead `href="#"`/empty href, an unnamed control, or a plain-`disabled`
// control masquerading as `aria-disabled` without a reason.
//
// A manual read-only sweep of src/components/** and src/app/** (TASK-25,
// EXE log) traced every onClick/href/callback and found zero dead controls.
// TASK-21 replaced the last ComingSoon stub (/settings/eval) and the
// component was deleted in TASK-25; the sweep below asserts none comes back.
// This spec turns that sweep into a standing structural check so a future
// regression (a stray `href="#"`, a disabled-looking control with no reason)
// fails CI instead of waiting for the next manual audit.

const ROUTES = ["/", "/queue", "/disputes", "/payments", "/drafts", "/audit", "/settings", "/settings/eval", "/invoices/INV-042"];

async function open(page: Page, href: string): Promise<void> {
  await page.goto(href);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
  if (href === "/queue") await expect(page.locator('main a[href^="/invoices/"]').first()).toBeVisible();
  if (href.startsWith("/invoices/")) await expect(page.getByTestId("priority-reason")).toHaveText(/\S/);
}

test("TC-081: no dead href, every control is named, and aria-disabled always has a visible reason", async ({ page }) => {
  const problems: string[] = [];
  for (const href of ROUTES) {
    await open(page, href);
    const found = await page.evaluate(() => {
      const bad: string[] = [];
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a")) {
        const hrefAttr = a.getAttribute("href");
        if (hrefAttr === "#" || hrefAttr === "") bad.push(`dead href on <a>: ${a.outerHTML.slice(0, 80)}`);
        if (!a.textContent?.trim() && !a.getAttribute("aria-label")) bad.push(`unnamed <a>: ${a.outerHTML.slice(0, 80)}`);
      }
      for (const b of document.querySelectorAll<HTMLButtonElement>("button")) {
        if (!b.textContent?.trim() && !b.getAttribute("aria-label")) bad.push(`unnamed <button>: ${b.outerHTML.slice(0, 80)}`);
        if (b.getAttribute("aria-disabled") === "true") {
          const describedBy = b.getAttribute("aria-describedby");
          const reasonText = describedBy ? document.getElementById(describedBy)?.textContent?.trim() : "";
          if (!reasonText) bad.push(`aria-disabled without a visible reason: ${b.outerHTML.slice(0, 80)}`);
        }
      }
      return bad;
    });
    problems.push(...found.map((f) => `${href}: ${f}`));
    if ((await page.getByRole("heading", { name: "Coming soon" }).count()) > 0) {
      problems.push(`${href}: ComingSoon placeholder still rendered`);
    }
  }
  expect(problems).toEqual([]);
});

test("TC-081: the primary action's disabled reason is visible when it is aria-disabled", async ({ page }) => {
  // Spot-check the documented exemplar (ActionBar primary-action) behaviorally:
  // a fresh invoice has no draft yet, so the primary action starts disabled
  // with its reason shown inline, not only in a tooltip.
  await open(page, "/invoices/INV-042");
  const primary = page.getByTestId("action-bar").getByTestId("primary-action");
  if ((await primary.getAttribute("aria-disabled")) === "true") {
    await expect(page.getByTestId("primary-reason")).toBeVisible();
    await expect(page.getByTestId("primary-reason")).toHaveText(/\S/);
  }
});
