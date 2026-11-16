import { ImageResponse } from "next/og";
import { BRAND_COLOR, LOGO_PATHS } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon for iOS: the logo mark on a full-bleed indigo square (iOS rounds the corners).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: BRAND_COLOR }}>
        <svg fill="none" height="120" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="120">
          {LOGO_PATHS.map((d) => (
            <path d={d} key={d} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
