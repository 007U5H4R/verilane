import { test, expect, type Page } from "@playwright/test";

// TKT-75.06 · TC-75.35: the Manager-only "Reverse allocation" control on
// /exceptions/[id] (Design-TASK-75 A1 item 3). Analyst: no control, and a
// direct attempt is refused and audited (FS21). Manager: confirm step →
// the item reopens, P-012 is unapplied, INV-F's balance is back, and the
// audit trail shows the reversal on top of 79.3's agent rows. Plus offline,
// and no horizontal scroll at 375 / 768 with the section and its dialog.

const ID = "RV-PAY-P-012";
const SHOTS = "test-results/reverse-allocation";

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => window.__verilane !== undefined);
  await expect(page.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
}

async function allocate(page: Page) {
  await open(page, `/exceptions/${ID}`);
  // 79.3 (EXE131): the agent stages land on the trail before anyone acts.
  await expect(page.getByTestId("exception-audit")).toContainText("Policy Agent evaluated exception (verdict:");
  // TKT-75.04 (EXE184): P-012 is auto_permitted, so Execute applies it on view.
  await expect(page.getByTestId("exception-status")).toHaveText("Resolved");
}

async function switchRole(page: Page, role: "Manager" | "Analyst") {
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: role }).click();
  await expect(page.getByRole("group", { name: "Role" }).getByRole("button", { name: role })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function trail(page: Page) {
  return page.evaluate(async (id) => {
    const rows = await window.__verilane!.db.audit.where("subject").equals(`review:${id}`).toArray();
    return rows.map((r) => ({ action: r.action, actor_role: r.actor_role, after: r.after as Record<string, unknown> }));
  }, ID);
}

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test("TC-75.35: Analyst sees no reverse control and a direct attempt is refused and audited", async ({ page }) => {
  await allocate(page);
  await expect(page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Analyst" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Hidden, not dead (ticket AC, EXE143).
  await expect(page.getByTestId("reverse-allocation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reverse allocation" })).toHaveCount(0);

  const before = await trail(page);
  const outcome = await page.evaluate(async (id) => {
    try {
      await window.__verilane!.execute({ type: "reverse_allocation", subject: { kind: "review", id }, payload: {} });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, ID);
  expect(outcome).toEqual({ ok: false, message: "Only a Manager can reverse an allocation." });

  const after = await trail(page);
  expect(after).toHaveLength(before.length + 1);
  expect(after.at(-1)).toMatchObject({
    action: "permission_denied",
    actor_role: "analyst",
    after: { refused_action: "reverse_allocation" },
  });
  await expect(page.getByTestId("exception-audit")).toContainText(
    "Refused reverse allocation on RV-PAY-P-012: Only a Manager can reverse an allocation.",
  );
  // Nothing moved.
  const stored = await page.evaluate(async () => ({
    payment: await window.__verilane!.db.payments.get("P-012"),
    exception: await window.__verilane!.db.exceptions.get("RV-PAY-P-012"),
  }));
  expect(stored.payment?.invoice_id).toBe("INV-F");
  expect(stored.exception?.status).toBe("actioned");
});

test("TC-75.35: Manager reverses an allocation through a confirm step; the item reopens and the trail shows it", async ({
  page,
}) => {
  await allocate(page);
  await switchRole(page, "Manager");

  const section = page.getByTestId("reverse-allocation");
  await expect(section).toContainText("Payment P-012 (₹25,000.00) is applied to INV-F.");
  // The section is its own block, not inside the action bar (79.4 owns that).
  await expect(page.getByRole("group", { name: "Exception actions" }).getByTestId("reverse-allocation-open")).toHaveCount(0);

  // Confirm step: Cancel changes nothing.
  await section.getByTestId("reverse-allocation-open").click();
  const dialog = page.getByRole("alertdialog", { name: "Reverse this allocation?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("exception-status")).toHaveText("Resolved");
  expect((await trail(page)).some((e) => e.action === "reverse_allocation")).toBe(false);

  await section.getByTestId("reverse-allocation-open").click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/confirm.png` });
  await dialog.getByTestId("reverse-allocation-confirm").click();

  await expect(page.getByText(/Reversed allocation of payment P-012 \(₹25,000\.00\) from INV-F \(audit event #\d+\)/).first()).toBeVisible();
  await expect(page.getByTestId("exception-status")).toHaveText("Open");
  await expect(page.getByTestId("reverse-allocation")).toHaveCount(0);
  await expect(page.getByTestId("reversed-notice")).toContainText("Allocation reversed");
  await expect(page.getByTestId("candidate-INV-F")).toBeVisible();
  await expect(page.getByTestId("exception-audit")).toContainText("Reversed allocation of payment P-012");
  await page.screenshot({ path: `${SHOTS}/reversed.png`, fullPage: true });

  const events = await trail(page);
  const actions = events.map((e) => e.action);
  // 79.3's agent rows are still there, ahead of the human actions.
  expect(actions).toContain("recommend_generated");
  expect(actions).toContain("policy_evaluated");
  const allocateIdx = actions.lastIndexOf("allocate_payment");
  expect(actions.slice(allocateIdx)).toEqual(["allocate_payment", "reverse_allocation"]);
  const reversal = events.at(-1)!;
  expect(reversal.actor_role).toBe("manager");
  expect(reversal.after).toMatchObject({ status: "open", invoice_id: null, reopen_reason: "reversed" });
  expect(typeof reversal.after.reverses_event_id).toBe("number");

  const stored = await page.evaluate(async () => ({
    payment: await window.__verilane!.db.payments.get("P-012"),
    exception: await window.__verilane!.db.exceptions.get("RV-PAY-P-012"),
  }));
  expect(stored.payment?.invoice_id).toBeNull();
  expect(stored.exception).toMatchObject({ status: "open", reopen_reason: "reversed", reversed: true });
});

test("TC-75.35: the reverse section is usable offline and does not scroll horizontally at 375 or 768", async ({
  page,
  context,
}) => {
  await allocate(page);
  await switchRole(page, "Manager");

  const overflow: string[] = [];
  for (const vp of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(vp);
    await open(page, `/exceptions/${ID}`);
    const section = page.getByTestId("reverse-allocation");
    await expect(section).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    if (!(await noHorizontalScroll(page))) overflow.push(`section @${vp.width}`);
    await page.screenshot({ path: `${SHOTS}/section-${vp.width}.png`, fullPage: true });

    await section.getByTestId("reverse-allocation-open").click();
    const dialog = page.getByRole("alertdialog", { name: "Reverse this allocation?" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > vp.width) overflow.push(`dialog @${vp.width}: ${JSON.stringify(box)}`);
    if (!(await noHorizontalScroll(page))) overflow.push(`dialog page @${vp.width}`);
    await page.screenshot({ path: `${SHOTS}/dialog-${vp.width}.png` });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(overflow).toEqual([]);

  // Offline (Design-TASK-75 §13, EXE143): the banner shows; the reversal is a
  // local IndexedDB write that needs no sync, so — like allocation — it stays
  // available and still lands in one transaction.
  await context.setOffline(true);
  try {
    await expect(page.getByText("You're offline — viewing cached data; some actions are paused")).toBeVisible();
    await page.getByTestId("reverse-allocation-open").click();
    await page.getByTestId("reverse-allocation-confirm").click();
    await expect(page.getByTestId("exception-status")).toHaveText("Open");
    await expect(page.getByTestId("reversed-notice")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/offline-reversed-768.png`, fullPage: true });
  } finally {
    await context.setOffline(false);
  }
});

test("TC-75.35: a failed reversal keeps the dialog open with the error, writes nothing, and can be retried (review r2 m3)", async ({
  page,
}) => {
  await allocate(page);
  await switchRole(page, "Manager");
  await page.getByTestId("reverse-allocation-open").click();
  const dialog = page.getByRole("alertdialog", { name: "Reverse this allocation?" });
  await expect(dialog).toBeVisible();

  // Force the command's rw transaction to abort: the audit write throws.
  await page.evaluate(() => {
    const w = window as unknown as { __failAudit?: () => never };
    w.__failAudit = () => {
      throw new Error("Forced audit failure (TC-75.35 m3)");
    };
    window.__verilane!.db.audit.hook("creating", w.__failAudit);
  });
  await dialog.getByTestId("reverse-allocation-confirm").click();

  await expect(dialog.getByTestId("reverse-allocation-error")).toContainText("Forced audit failure");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("reverse-allocation-confirm")).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/error.png` });
  const stored = await page.evaluate(async () => ({
    payment: await window.__verilane!.db.payments.get("P-012"),
    exception: await window.__verilane!.db.exceptions.get("RV-PAY-P-012"),
  }));
  expect(stored.payment?.invoice_id).toBe("INV-F");
  expect(stored.exception?.status).toBe("actioned");
  expect((await trail(page)).some((e) => e.action === "reverse_allocation")).toBe(false);

  // Recovery: lift the fault and retry from the same dialog.
  await page.evaluate(() => {
    const w = window as unknown as { __failAudit?: () => never };
    window.__verilane!.db.audit.hook("creating").unsubscribe(w.__failAudit!);
  });
  await dialog.getByTestId("reverse-allocation-confirm").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("exception-status")).toHaveText("Open");
  await expect(page.getByTestId("reversed-notice")).toBeVisible();
});

test("TC-75.35: switching to Analyst while the confirm dialog is open removes it (review r2 m4)", async ({ page }) => {
  await allocate(page);
  await switchRole(page, "Manager");
  await page.getByTestId("reverse-allocation-open").click();
  const dialog = page.getByRole("alertdialog", { name: "Reverse this allocation?" });
  await expect(dialog).toBeVisible();

  // The role switcher sits behind the modal overlay; switch the way another tab would.
  await page.evaluate(() =>
    window.__verilane!.execute({ type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "analyst" } }),
  );
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("reverse-allocation")).toHaveCount(0);
  await expect(page.getByTestId("exception-status")).toHaveText("Resolved");
  expect((await trail(page)).some((e) => e.action === "reverse_allocation")).toBe(false);
});

test("TC-75.35 + TKT-75.04 risk (b): after a Manager reversal, Execute does not re-apply on reload (EXE181)", async ({
  page,
}) => {
  await allocate(page);
  await switchRole(page, "Manager");
  await page.getByTestId("reverse-allocation-open").click();
  await page.getByTestId("reverse-allocation-confirm").click();
  await expect(page.getByTestId("exception-status")).toHaveText("Open");

  // A fresh page view re-runs Policy + Execute; Execute must refuse, writing nothing.
  await open(page, `/exceptions/${ID}`);
  await expect(page.getByTestId("exception-status")).toHaveText("Open");
  await expect(page.getByTestId("reversed-notice")).toBeVisible();
  const actions = (await trail(page)).map((e) => e.action);
  expect(actions.filter((a) => a === "allocate_payment")).toHaveLength(1);
  expect(actions.slice(actions.indexOf("reverse_allocation"))).not.toContain("allocate_payment");
  expect(await page.evaluate(async () => (await window.__verilane!.db.payments.get("P-012"))?.invoice_id)).toBeNull();
});
