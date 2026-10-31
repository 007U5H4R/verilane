/**
 * `DataProvider` must load client-only, via `dynamic(…, {ssr:false})`
 * (technical-plan.md TASK-7.6). Next.js 16 disallows `ssr:false` directly
 * inside a Server Component — it must be called from within a Client
 * Component (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md)
 * — so this thin wrapper owns that call, and `layout.tsx` imports it as an
 * ordinary component.
 */
"use client";
import dynamic from "next/dynamic";

import { ShellLoading } from "@/components/shell/ShellLoading";

export const DataProviderLoader = dynamic(
  () => import("./DataProvider").then((m) => m.DataProvider),
  { ssr: false, loading: () => <ShellLoading /> },
);
