import type { BrowserContext } from "@playwright/test";

/** Hold the seed manifest (the first fetch that gates seeding, or the
 * returning visit's version check) so ready lands late and the splash stays
 * up through `on` into `hold`. Each request is held until `release()` is
 * called or, when `ms` is given, for `ms` after it arrives, whichever is
 * first. Shared by splash.spec.ts and splash-bar.spec.ts (TASK-45.10 R-6). */
export async function holdManifest(context: BrowserContext, ms?: number) {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  await context.route("**/seed/manifest.json", async (route) => {
    await (ms === undefined ? released : Promise.race([released, new Promise((r) => setTimeout(r, ms))]));
    await route.continue().catch(() => {});
  });
  return { release };
}
