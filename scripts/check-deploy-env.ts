#!/usr/bin/env tsx
// Guard (TASK-59 · SEC-003 / CR-017): the deploy build must never ship the
// e2e hooks (NEXT_PUBLIC_E2E=1 compiles `?__state=` / `window.__verilane` in)
// or live-LLM mode (ANTHROPIC_API_KEY + VERILANE_LIVE_LLM). Runs first in
// `pnpm vercel-build`, so a mis-set Vercel env fails the build instead of
// deploying. Ruling: it fails on every Vercel environment (preview too), not
// only VERCEL_ENV=production — previews are public URLs as well.
// Never prints a variable's value, only its name.

const violations: string[] = [];
const env = process.env;

if (env.NEXT_PUBLIC_E2E === "1") {
  violations.push("NEXT_PUBLIC_E2E=1 would compile the e2e-only hooks into the bundle");
}
if (env.VERILANE_LIVE_LLM !== undefined && env.VERILANE_LIVE_LLM !== "") {
  violations.push("VERILANE_LIVE_LLM is set — live-LLM mode must stay off in deploys");
}
if (env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY !== "") {
  violations.push("ANTHROPIC_API_KEY is set — remove it from the deploy environment");
}

if (violations.length > 0) {
  for (const v of violations) console.error(`check-deploy-env: ${v}`);
  process.exit(1);
}
console.log("check-deploy-env: clean — no e2e or live-LLM variables in the deploy env.");
