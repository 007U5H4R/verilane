import { test, expect, type Page } from "@playwright/test";

// TASK-39 · welcome, sign-in/up, product tour and guest entry.
// The e2e build is a guest by default so older specs keep landing on the app;
// every test here opts out with `?__session=none` (per tab) and so starts
// signed out, exactly like a real first visit.

const SIGNED_OUT = "?__session=none";

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
}

const guestBadge = (page: Page) => page.getByRole("button", { name: /Guest/ });

test.describe("welcome and auth forms", () => {
  test("welcome links to sign in and create account", async ({ page }) => {
    await page.goto(`/welcome${SIGNED_OUT}`);
    await expect(page.getByRole("heading", { level: 1, name: "Collections, with clarity." })).toBeVisible();
    for (const t of ["Explore with demo data", "No setup needed", "Full product experience"]) {
      await expect(page.getByText(t)).toBeVisible();
    }

    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back." })).toBeVisible();

    await page.getByRole("link", { name: "Back to welcome" }).click();
    await page.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("heading", { level: 1, name: "Create your account." })).toBeVisible();
  });

  test("sign in validates inline, then says honestly that accounts aren't available", async ({ page }) => {
    await page.goto(`/sign-in${SIGNED_OUT}`);
    const form = page.getByRole("form", { name: "Sign in" });
    await form.getByRole("button", { name: "Sign in" }).click();

    const email = page.getByLabel("Work email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Accounts aren't available" })).toHaveCount(0);

    await email.fill("priya@example.com");
    await page.getByLabel("Password", { exact: true }).fill("anything1");
    await form.getByRole("button", { name: "Sign in" }).click();

    const notice = page.getByRole("status").filter({ hasText: "Accounts aren't available in this demo yet." });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Nothing you typed was sent or saved");
    await expect(notice.getByRole("button", { name: /Continue as guest/ })).toBeVisible();
    // No session was created by submitting the form.
    expect(await page.evaluate(() => localStorage.getItem("verilane-session"))).toBeNull();
  });

  test("create account validates the name and the client-side password hints", async ({ page }) => {
    await page.goto(`/sign-up${SIGNED_OUT}`);
    await expect(page.getByText("Password hints (checked in your browser only):")).toBeVisible();
    const form = page.getByRole("form", { name: "Create account" });
    await form.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Full name").fill("Priya Nair");
    await page.getByLabel("Work email").fill("priya@example.com");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await form.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Password", { exact: true }).fill("longer-pass-1");
    await form.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Accounts aren't available in this demo yet." })).toBeVisible();
  });
});

test.describe("guest mode", () => {
  test("continue as guest → Home with the badge; refresh keeps it; exit → welcome", async ({ page }) => {
    await page.goto(`/welcome${SIGNED_OUT}`);
    await page.getByRole("button", { name: /Continue as guest/ }).click();
    await expectHome(page);
    await expect(guestBadge(page)).toContainText("Demo Workspace");

    await page.reload();
    await expectHome(page);
    await expect(guestBadge(page)).toBeVisible();

    await guestBadge(page).click();
    const menu = page.getByRole("group", { name: "Guest mode" });
    await expect(menu.getByRole("link", { name: "Product tour" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Sign in / Create account" })).toBeVisible();
    await menu.getByRole("button", { name: "Exit guest mode" }).click();

    await expect(page).toHaveURL(/\/welcome$/);
    expect(await page.evaluate(() => localStorage.getItem("verilane-session"))).toBeNull();
    // Signed out again: the app is gated.
    await page.goto("/queue");
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test("a deep link while signed out lands on welcome, never on app content", async ({ page }) => {
    await page.goto(`/queue${SIGNED_OUT}`);
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1, name: "Collections, with clarity." })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("the guest badge menu opens the product tour", async ({ page }) => {
    await page.goto(`/welcome${SIGNED_OUT}`);
    await page.getByRole("button", { name: /Continue as guest/ }).click();
    await expectHome(page);
    await guestBadge(page).click();
    await page.getByRole("group", { name: "Guest mode" }).getByRole("link", { name: "Product tour" }).click();
    await expect(page).toHaveURL(/\/onboarding\?step=1$/);
    await expect(page.getByText("STEP 1 OF 3")).toBeVisible();
  });
});

test.describe("product tour", () => {
  test("next, back, browser back/forward, then get started → Home as guest", async ({ page }) => {
    await page.goto(`/welcome${SIGNED_OUT}`);
    await page.getByRole("link", { name: "Take the 30-second tour" }).click();
    await expect(page).toHaveURL(/\/onboarding\?step=1$/);
    await expect(page.getByRole("heading", { level: 1, name: "Prioritise collections." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/step=2$/);
    await expect(page.getByRole("heading", { level: 1, name: "Understand the context." })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Tour progress" })).toHaveAttribute("aria-valuenow", "2");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/step=1$/);

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/step=3$/);
    await expect(page.getByRole("heading", { level: 1, name: "Prepare with confidence." })).toBeVisible();
    await expect(page.getByText("Nothing is ever sent to a customer without a person approving it first.")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/step=2$/);
    await expect(page.getByRole("heading", { level: 1, name: "Understand the context." })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/step=3$/);

    await page.getByRole("button", { name: "Get started" }).click();
    await expectHome(page);
    await expect(guestBadge(page)).toBeVisible();
  });

  test("skip enters guest mode and goes Home", async ({ page }) => {
    await page.goto(`/onboarding${SIGNED_OUT}&step=2`);
    await expect(page.getByText("STEP 2 OF 3")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expectHome(page);
    expect(await page.evaluate(() => localStorage.getItem("verilane-session"))).toBe("guest");
  });

  test("an unknown step falls back to step 1", async ({ page }) => {
    await page.goto(`/onboarding${SIGNED_OUT}&step=9`);
    await expect(page.getByText("STEP 1 OF 3")).toBeVisible();
  });
});

test.describe("responsive", () => {
  for (const width of [375, 768]) {
    test(`no onboarding page scrolls horizontally at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 812 });
      for (const path of ["/welcome", "/sign-in", "/sign-up", "/onboarding"]) {
        await page.goto(`${path}${SIGNED_OUT}`);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: info.outputPath(`${path.slice(1)}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    });
  }
});
