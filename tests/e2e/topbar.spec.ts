import { test, expect, type Page } from "@playwright/test";

import { NAV_ITEMS } from "../../src/components/shell/NavItems";

// TASK-38: the premium top bar — every control is wired to the real app.
// Sidebar collapse, ⌘K search, role switch, theme, live bell, breadcrumb.

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
}

test("T38: the sidebar toggle collapses and expands the shell, and remembers it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  const shell = page.locator("[data-sidebar]");
  const header = page.locator("header").first();
  await expect(shell).toHaveAttribute("data-sidebar", "expanded");
  const collapse = header.getByRole("button", { name: "Collapse sidebar" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");

  await collapse.click();
  await expect(shell).toHaveAttribute("data-sidebar", "collapsed");
  const expand = header.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  // The grid's first column follows the state (272px → 72px).
  await expect
    .poll(() => shell.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ")[0]))
    .toBe("72px");

  await page.reload();
  await expect(shell).toHaveAttribute("data-sidebar", "collapsed");
  await header.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(shell).toHaveAttribute("data-sidebar", "expanded");
  await expect
    .poll(() => shell.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ")[0]))
    .toBe("272px");
});

test("T38: ⌘K / Ctrl+K focuses search and a real result navigates", async ({ page }) => {
  await ready(page);
  const box = page.getByRole("combobox", { name: "Search invoices, customers, or emails" });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box).toBeFocused();
  // The shortcut hint names this platform's modifier.
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  await expect(page.locator('[role="search"] kbd')).toHaveText(mac ? "⌘ K" : "Ctrl K");

  await box.fill("INV-1042");
  const option = page.getByRole("option").filter({ hasText: "INV-1042" }).first();
  await expect(option).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/invoices\/INV-042$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).locator('[aria-current="page"]')).toHaveText(
    "INV-1042",
  );
});

test("T38: below 1280 search opens from its icon, and Escape returns focus to it", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await ready(page);
  const box = page.getByRole("combobox", { name: "Search invoices, customers, or emails" });
  const icon = page.locator("header").getByRole("button", { name: "Search", exact: true });
  await expect(box).toBeHidden();
  await icon.click();
  await expect(icon).toHaveAttribute("aria-expanded", "true");
  await expect(box).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(box).toBeHidden();
  await expect(icon).toBeFocused();

  await page.keyboard.press("ControlOrMeta+k");
  await expect(box).toBeFocused();
});

test("T38: the role switch in the top bar changes the acting role, audited", async ({ page }) => {
  await ready(page, "/audit");
  const role = page.locator("header").getByRole("group", { name: "Role" });
  await expect(role.getByRole("button", { name: "Analyst" })).toHaveAttribute("aria-pressed", "true");
  await role.getByRole("button", { name: "Manager" }).click();
  await expect(role.getByRole("button", { name: "Manager" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(async () => (await window.__verilane!.db.meta.get("role"))?.value)).toBe(
    "manager",
  );
  await expect(page.getByTestId("audit-row").first()).toContainText("Switched role from Analyst to Manager");
  // The account panel reports the same role; nothing invented.
  await page.locator("header").getByRole("button", { name: "Account" }).click();
  await expect(page.locator("#account-panel")).toContainText("Acting as Manager");
});

test("T38: the theme toggle flips and persists the theme", async ({ page }) => {
  await ready(page);
  const html = page.locator("html");
  const before = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const after = before === "dark" ? "light" : "dark";
  await page.locator("header").getByRole("button", { name: "Toggle dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", after);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after);
});

test("T38: the bell's count is the live attention count from the store", async ({ page }) => {
  await ready(page);
  const facts = await page.evaluate(async () => {
    const db = window.__verilane!.db;
    const [openDisputes, needsReview] = await Promise.all([
      db.disputes.where("status").noneOf(["resolved", "rejected"]).count(),
      db.priorities.where("band").equals("needs_review").count(),
    ]);
    return { openDisputes, needsReview };
  });
  const bell = page.locator("header").getByRole("button", { name: /^Notifications, \d+ need attention$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.locator("#notifications-panel");
  await expect(panel).toBeVisible();
  const rows = panel.getByRole("link");
  const counts = await rows.evaluateAll((links) =>
    links.map((a) => ({ href: a.getAttribute("href"), n: Number(a.querySelector("span:last-child")?.textContent) })),
  );
  const byHref = Object.fromEntries(counts.map((r) => [r.href, r.n]));
  expect(byHref["/disputes"] ?? 0).toBe(facts.openDisputes);
  expect(byHref["/queue"] ?? 0).toBe(facts.needsReview);
  const total = counts.reduce((s, r) => s + r.n, 0);
  await expect(bell).toHaveAccessibleName(`Notifications, ${total} need attention`);

  // A real change in the store moves the count.
  if (facts.openDisputes > 0) {
    await page.evaluate(async () => {
      const db = window.__verilane!.db;
      const open = await db.disputes.where("status").noneOf(["resolved", "rejected"]).first();
      await db.disputes.update(open!.dispute_id, { status: "resolved" });
    });
    await expect(bell).toHaveAccessibleName(`Notifications, ${total - 1} need attention`);
  }
});

test("T38: every nav route names itself as the current crumb, after the home icon", async ({ page }) => {
  await ready(page);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  for (const item of NAV_ITEMS) {
    await page.goto(item.href);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(item.label);
    await expect(crumbs.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  }
});

test("T38: at 390 the menu button opens every nav destination", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, "/queue");
  await expect(page.locator("header").getByText("DEMO DATA")).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Open menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  for (const item of NAV_ITEMS) await expect(sheet.getByRole("link", { name: item.label, exact: true })).toBeVisible();
  await sheet.getByRole("link", { name: "Disputes", exact: true }).click();
  await expect(page).toHaveURL(/\/disputes$/);
  await expect(sheet).toBeHidden();
});

// Scar: the two-row mobile header once overflowed a 375px phone by 10px.
test("T38: the header fits a 375px phone without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/queue", "/settings"]) {
    await ready(page, path);
    await expect(page.locator("header").getByRole("button", { name: /^Notifications/ })).toBeVisible();
    const overflow = await page.evaluate(() =>
      Math.max(0, ...[...document.querySelectorAll("header *")].map((el) => el.getBoundingClientRect().right - window.innerWidth)),
    );
    expect(overflow, `header overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});
