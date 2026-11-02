"use client";

import { useContext, useState } from "react";

import { useCommand } from "@/components/useCommand";
import { ROLE_LABEL } from "@/domain/commandConstants";
import { ROLES, type Role } from "@/domain/permissions";
import { DbContext, useRole } from "@/store/hooks";

// TASK-14.5: the demo role switch. Every switch is an audited command
// (`switch_role`) and the choice persists in `meta.role`.
export function RoleSwitcher() {
  const db = useContext(DbContext);
  return db ? <LiveRoleSwitcher /> : <RoleButtons role="analyst" disabled />;
}

function LiveRoleSwitcher() {
  const role = useRole();
  const run = useCommand();
  const [busy, setBusy] = useState(false);

  async function choose(next: Role) {
    if (!run || next === role || busy) return;
    setBusy(true);
    try {
      await run({
        type: "switch_role",
        subject: { kind: "system", id: "workspace" },
        payload: { role: next },
      });
    } catch {
      // Reason already shown as a toast.
    } finally {
      setBusy(false);
    }
  }

  return <RoleButtons role={role} disabled={busy} onChoose={choose} />;
}

function RoleButtons({
  role,
  disabled,
  onChoose,
}: {
  role: Role;
  disabled?: boolean;
  onChoose?: (r: Role) => void;
}) {
  return (
    <div
      className={`inline-flex h-11 shrink-0 items-center rounded-full border border-topbar-control-border bg-surface p-1 shadow-[0_1px_2px_rgb(8_47_37/0.05)] ${disabled ? "opacity-60" : ""}`}
      role="group"
      aria-label="Role"
    >
      {ROLES.map((r) => {
        const pressed = r === role;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            aria-pressed={pressed}
            onClick={() => onChoose?.(r)}
            className={`h-9 rounded-full px-2.5 text-[14px] transition-colors duration-200 disabled:cursor-not-allowed md:px-4 md:text-[15px] ${
              pressed
                ? "bg-brand font-semibold text-on-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(8_47_37/0.18)]"
                : "font-medium text-text-muted hover:text-text"
            }`}
          >
            {ROLE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

/** The current role's label (Sidebar workspace card). */
export function RoleLabel() {
  const db = useContext(DbContext);
  return db ? <LiveRoleLabel /> : <>{ROLE_LABEL.analyst}</>;
}

function LiveRoleLabel() {
  return <>{ROLE_LABEL[useRole()]}</>;
}
