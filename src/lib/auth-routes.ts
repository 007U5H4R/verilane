/**
 * Routes that render without the app shell and need no session. TASK-45.3
 * lifted the list out of `session.ts` (a "use client" module) so the server
 * layout can hand the same list to the splash runtime (PRD §2.3: one list,
 * reused, not copied).
 */
export const AUTH_ROUTES = ["/welcome", "/sign-in", "/sign-up", "/onboarding"] as const;
