import type { MetadataRoute } from "next";

// TASK-24.1 (Design §D5): standalone display, --rail theme colour matching
// the icons' frame, canvas background behind the splash screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Verilane — AR Copilot",
    short_name: "Verilane",
    description: "Every collection action has evidence. Every uncertain decision has a human.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#0f3d29",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
