// TC-002 fixture: this file deliberately violates SR2 (domain purity) by
// importing React inside src/domain/**. It must NOT be picked up by the
// normal `pnpm lint` run (excluded there) but MUST fail `pnpm lint:domain-fixture`,
// which lints only this file against the SR2 override in eslint.config.mjs.
import { useState } from "react";

// Re-export only (no hook call) so the sole failing rule is SR2's import ban.
export const forbidden = useState;
