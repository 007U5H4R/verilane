import { expect, test } from "@playwright/test";

// TASK-21.5: /settings/eval renders the committed eval/report.md.
test.describe("evaluation report", () => {
  test("renders the gate table from eval/report.md", async ({ page }, testInfo) => {
    await page.goto("/settings/eval");
    await expect(page.getByRole("heading", { level: 1, name: "Evaluation report" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Gates" })).toBeVisible();
    const gates = page.getByRole("table").first();
    for (const name of ["Amount exact match", "Dispute recall", "Approval enforcement"]) {
      await expect(gates.getByRole("cell", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Coming soon")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("eval-desktop.png"), fullPage: true });
  });

  test("has no horizontal page scroll at phone width", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/settings/eval");
    await expect(page.getByRole("heading", { level: 1, name: "Evaluation report" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("eval-375.png"), fullPage: true });
  });
});
