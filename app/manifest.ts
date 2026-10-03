import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aero Driver",
    short_name: "Aero Driver",
    description: "Aero Driver",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#0d1226",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
