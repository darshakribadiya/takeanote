import { APP_DESCRIPTION, APP_NAME } from "@/constants";
import { BRAND_COLOR } from "@/components/logo";

// Web app manifest (/manifest.webmanifest): install name, icons and colors.
export default function manifest() {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRAND_COLOR,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
