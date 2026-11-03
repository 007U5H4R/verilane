"use client";

import { useEffect } from "react";

// CR-005: last-resort boundary for errors in the root layout itself. It
// replaces the layout, so global CSS, fonts and theme are absent: styles are
// inline and minimal. Metadata exports are unsupported here, hence <title>.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <title>Something went wrong — Verilane</title>
        <main role="alert" style={{ padding: "24px 16px", maxWidth: 560 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#555", margin: "0 0 16px" }}>
            Verilane hit an unexpected error. Your data is stored on this device and is unchanged.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 16px", fontSize: 15, borderRadius: 8, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
