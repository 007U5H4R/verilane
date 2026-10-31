import { test, expect } from "@playwright/test";

test("queue route loads", async ({ page }) => {
  const response = await page.goto("/queue");
  expect(response?.ok()).toBe(true);
});
