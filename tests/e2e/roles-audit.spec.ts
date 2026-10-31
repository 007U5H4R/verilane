import { test, expect, type Page } from "@playwright/test";

// TASK-14: TC-039 (FS13 permission enforcement) and TC-040 (audit log).
const SHOTS = "/Volumes/E Drive/Dev/.scratch/verilane/reports";
const DRAFT_ID = "E2E-DRAFT-1";
const REASON = "Only a Manager can approve reminders above ₹5,00,000.";

async function bridge(page: Page) {
  await page.waitForFunction(() => window.__verilane !== undefined);
}

async function auditCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__verilane!.db.audit.count());
}

async function draftStatus(page: Page): Promise<unknown> {
  return page.evaluate((id) => window.__verilane!.db.drafts.get(id).then((d) => d?.status), DRAFT_ID);
}

test("TC-039: Analyst cannot approve a >₹5L reminder, even when forced", async ({ page }, info) => {
  await page.goto("/e2e-harness");
  await bridge(page);
  // A real generated draft (TASK-16: approve re-runs the nine checks, so a
  // bare fixture would fail re-validation), cloned with a >₹5L amount.
  await page.evaluate(async (id) => {
    const v = window.__verilane!;
    await v.execute({ type: "generate_draft", subject: { kind: "invoice", id: "INV-A" } });
    const generated = await v.db.drafts.where("invoice_id").equals("INV-A").first();
    await v.db.drafts.put({
      ...generated!,
      draft_id: id,
      status: "validated",
      amount_paise: 60_000_000, // ₹6,00,000
    });
  }, DRAFT_ID);

  const approve = page.getByRole("button", { name: "Approve & send" });
  await expect(page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Analyst" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(approve).toBeDisabled();
  await expect(page.getByText(REASON)).toBeVisible();
  await expect(approve).toHaveAccessibleDescription(REASON);

  const beforeCount = await auditCount(page);
  const beforeStatus = await draftStatus(page);
  expect(beforeStatus).toBe("validated");

  const outcome = await page.evaluate(async (id) => {
    try {
      await window.__verilane!.execute({ type: "approve_draft", subject: { kind: "draft", id } });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, DRAFT_ID);

  expect(outcome).toEqual({ ok: false, message: REASON });
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: REASON })).toBeVisible();
  expect(await draftStatus(page)).toBe("validated");
  expect(await auditCount(page)).toBe(beforeCount);
  await expect(page.getByTestId("draft-status")).toHaveText("validated");
  await page.screenshot({ path: `${SHOTS}/TASK-14-tc039-${info.project.name}.png`, fullPage: true });

  // Same control, as Manager: enabled, and the approval is audited.
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByTestId("draft-status")).toHaveText("sent_simulated");
  expect(await auditCount(page)).toBe(beforeCount + 2); // role switch + approval
});

test("TC-040: audit log is reverse-chronological, filterable, read-only", async ({ page }, info) => {
  // Empty state on a fresh workspace.
  await page.goto("/audit");
  await expect(page.getByText("No activity yet")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-14-tc040-empty-${info.project.name}.png`, fullPage: true });

  // A role switch is an audited event.
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Manager" }).click();
  await expect(page.getByTestId("audit-row")).toHaveCount(1);
  await expect(page.getByTestId("audit-row").first()).toContainText("Switched role from Analyst to Manager");
  await expect(page.getByTestId("audit-row").first()).toContainText("Manager");

  // A note from the Activity log (harness mount), then back to /audit.
  await page.goto("/e2e-harness");
  const note = page.getByLabel("Add a note");
  await note.fill("Called AP, promised Friday");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(note).toHaveValue("");
  await expect(page.getByTestId("activity-row").first()).toContainText("Called AP, promised Friday");

  await page.goto("/audit");
  const rows = page.getByTestId("audit-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-action", "add_note");
  await expect(rows.nth(1)).toHaveAttribute("data-action", "switch_role");
  const times = await page.locator("[data-testid=audit-row] time").evaluateAll((els) =>
    els.map((e) => Date.parse(e.getAttribute("datetime") ?? "")),
  );
  expect(times).toEqual([...times].sort((a, b) => b - a));
  await page.screenshot({ path: `${SHOTS}/TASK-14-tc040-working-${info.project.name}.png`, fullPage: true });

  // Read-only: no edit/delete controls anywhere on the page.
  await expect(page.getByRole("button", { name: /edit|delete|remove/i })).toHaveCount(0);

  // Action filter.
  await page.getByLabel("Action").selectOption("switch_role");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-action", "switch_role");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(2);

  // Subject filter.
  await page.getByLabel("Subject").fill("INV-A");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-action", "add_note");
  await page.getByLabel("Subject").fill("no-such-subject");
  await expect(page.getByText("No events match these filters")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-14-tc040-filtered-empty-${info.project.name}.png`, fullPage: true });
});

test("TC-040: audit log shows an error state with retry when the store fails", async ({ page }, info) => {
  await page.goto("/queue");
  await bridge(page);
  // Fault injection: the audit read rejects, as a failing IndexedDB request
  // would (client-side nav keeps the patch on the live db instance).
  await page.evaluate(() => {
    const audit = window.__verilane!.db.audit as unknown as Record<string, unknown>;
    audit.orderBy = () => ({
      reverse: () => ({ toArray: () => Promise.reject(new Error("injected audit read failure")) }),
    });
  });
  await page.getByRole("link", { name: "Audit log" }).first().click();
  await expect(page.locator("[data-state=error]")).toContainText("Couldn’t load the audit log.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/TASK-14-tc040-error-${info.project.name}.png`, fullPage: true });

  // Store recovers → Retry re-queries and lands in the empty state.
  await page.evaluate(() => {
    delete (window.__verilane!.db.audit as unknown as Record<string, unknown>).orderBy;
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("No activity yet")).toBeVisible();
});
