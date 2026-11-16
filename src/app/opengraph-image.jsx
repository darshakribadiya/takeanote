import { ImageResponse } from "next/og";
import { BRAND_COLOR, LOGO_PATHS } from "@/components/logo";
import { APP_DESCRIPTION, APP_NAME } from "@/constants";

export const alt = `${APP_NAME}: ${APP_DESCRIPTION}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview for social sites and chat apps (also used for Twitter / X).
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 40,
          width: "100%",
          height: "100%",
          padding: "0 96px",
          background: "#fafaf9",
          color: "#1c1917",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 120,
              height: 120,
              borderRadius: 30,
              background: BRAND_COLOR,
            }}
          >
            <svg fill="none" height="84" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="84">
              {LOGO_PATHS.map((d) => (
                <path d={d} key={d} />
              ))}
            </svg>
          </div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{APP_NAME}</div>
        </div>
        <div style={{ fontSize: 44, color: "#57534e", maxWidth: 900, lineHeight: 1.3 }}>{APP_DESCRIPTION}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 28, color: BRAND_COLOR }}>
          <span>Documents</span>
          <span>·</span>
          <span>Canvas & flowcharts</span>
          <span>·</span>
          <span>Live sharing</span>
        </div>
      </div>
    ),
    size,
  );
}
