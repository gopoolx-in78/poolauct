import { ImageResponse } from "next/og";
import { site } from "@/config/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} — group buying and online auctions`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f7f5f0",
        color: "#141412",
      }}
    >
      <div style={{ fontSize: 32, letterSpacing: 4, textTransform: "uppercase" }}>{site.name}</div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.05 }}>
        <span>Buy together for better prices.</span>
        <span>Bid for what&rsquo;s worth having.</span>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ background: "#0b7a57", color: "#fff", padding: "12px 24px", fontSize: 28 }}>
          PoolX · Group buying
        </div>
        <div style={{ background: "#c2410c", color: "#fff", padding: "12px 24px", fontSize: 28 }}>
          Auctions · Second-hand assets
        </div>
      </div>
    </div>,
    size,
  );
}
